//! Keep-alive TCP pool for localhost sidecar requests.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{SocketAddr, TcpStream};
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::Duration;

pub(crate) const POOL_LIMIT: usize = 4;

pub(crate) struct Pooled {
    pub(crate) stream: TcpStream,
    pub(crate) pending: Vec<u8>,
}

pub(crate) struct Fail {
    pub(crate) message: String,
    pub(crate) saw_status: bool,
}

static POOL: LazyLock<Mutex<HashMap<u16, Vec<Pooled>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn pool_lock() -> MutexGuard<'static, HashMap<u16, Vec<Pooled>>> {
    POOL.lock().unwrap_or_else(|err| err.into_inner())
}

pub fn clear_ui_http_pool() {
    pool_lock().clear();
}

#[cfg(test)]
pub(crate) fn pooled_len(port: u16) -> usize {
    pool_lock().get(&port).map(|slot| slot.len()).unwrap_or(0)
}

pub(crate) fn socket_alive(stream: &TcpStream, pending: &[u8]) -> bool {
    if !pending.is_empty() {
        return true;
    }
    let previous = stream.read_timeout().unwrap_or(None);
    if stream
        .set_read_timeout(Some(Duration::from_millis(1)))
        .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 1];
    let mut alive = true;
    for _ in 0..3 {
        match stream.peek(&mut buf) {
            Ok(0) => {
                alive = false;
                break;
            }
            Ok(_) => {
                alive = true;
                break;
            }
            Err(err) if err.kind() == ErrorKind::Interrupted => continue,
            Err(err)
                if matches!(
                    err.kind(),
                    ErrorKind::WouldBlock | ErrorKind::TimedOut
                ) =>
            {
                alive = true;
                break;
            }
            Err(err)
                if matches!(
                    err.kind(),
                    ErrorKind::ConnectionReset
                        | ErrorKind::ConnectionAborted
                        | ErrorKind::BrokenPipe
                        | ErrorKind::NotConnected
                        | ErrorKind::UnexpectedEof
                ) =>
            {
                alive = false;
                break;
            }
            Err(err) if matches!(err.raw_os_error(), Some(10053 | 10054)) => {
                alive = false;
                break;
            }
            Err(_) => {
                alive = false;
                break;
            }
        }
    }
    let _ = stream.set_read_timeout(previous);
    alive
}

pub(crate) fn take_live(port: u16) -> Option<Pooled> {
    loop {
        let candidate = {
            let mut pool = pool_lock();
            pool.get_mut(&port).and_then(|slot| slot.pop())
        };
        let Some(conn) = candidate else {
            return None;
        };
        if socket_alive(&conn.stream, &conn.pending) {
            return Some(conn);
        }
    }
}

pub(crate) fn park(port: u16, conn: Pooled) {
    let mut pool = pool_lock();
    let slot = pool.entry(port).or_default();
    if slot.len() < POOL_LIMIT {
        slot.push(conn);
    }
}

pub(crate) fn connect(port: u16, timeout: Duration) -> Result<TcpStream, Fail> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let stream = TcpStream::connect_timeout(&addr, timeout.min(Duration::from_secs(5))).map_err(
        |err| Fail {
            message: format!("connect: {err}"),
            saw_status: false,
        },
    )?;
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    Ok(stream)
}
