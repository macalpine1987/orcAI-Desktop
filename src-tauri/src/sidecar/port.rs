//! Ephemeral port helpers for the sidecar process.

use std::net::{TcpListener, TcpStream};
use std::time::Duration;

pub fn pick_ephemeral_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    drop(listener);
    Some(port)
}

pub fn is_port_listening(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    TcpStream::connect_timeout(
        &addr.parse().expect("valid addr"),
        Duration::from_millis(400),
    )
    .is_ok()
}

pub(crate) fn port_listening_with_retries(port: u16, attempts: u32, delay: Duration) -> bool {
    for i in 0..attempts {
        if is_port_listening(port) {
            return true;
        }
        if i + 1 < attempts {
            std::thread::sleep(delay);
        }
    }
    false
}
