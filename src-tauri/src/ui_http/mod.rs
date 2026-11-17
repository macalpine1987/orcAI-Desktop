//! Keep-alive pool for sidecar requests made by the UI.
//! Health checks and engine start stay on `http_get` / `http_post_json` (curl).

mod codec;
mod exchange;
mod framing;
mod pool;

pub use codec::base64_encode;
pub use exchange::http_exchange_for_ui;
pub use pool::clear_ui_http_pool;

#[cfg(test)]
pub(crate) use framing::find_slice;
#[cfg(test)]
pub(crate) use pool::pooled_len;

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpListener, TcpStream};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, MutexGuard};
    use std::thread;
    use std::time::Duration;

    use super::exchange::UiHttpResponse;
    use super::{
        clear_ui_http_pool, find_slice, http_exchange_for_ui, pooled_len,
    };

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn lock_tests() -> MutexGuard<'static, ()> {
        TEST_LOCK.lock().unwrap_or_else(|err| err.into_inner())
    }

    fn exchange(
        port: u16,
        method: &str,
        path: &str,
        content_type: Option<&str>,
        body: &[u8],
    ) -> Result<UiHttpResponse, String> {
        http_exchange_for_ui(
            method,
            &format!("http://127.0.0.1:{port}{path}"),
            content_type,
            body,
            Duration::from_secs(3),
        )
    }

    fn http_len(status: u16, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status} OK\r\nContent-Length: {}\r\nContent-Type: text/plain\r\nConnection: keep-alive\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    fn read_one(stream: &mut TcpStream) -> std::io::Result<String> {
        stream.set_read_timeout(Some(Duration::from_secs(3)))?;
        let mut buf = Vec::new();
        let mut tmp = [0u8; 2048];
        let header_end = loop {
            if let Some(i) = find_slice(&buf, b"\r\n\r\n") {
                break i;
            }
            let n = stream.read(&mut tmp)?;
            if n == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "eof",
                ));
            }
            buf.extend_from_slice(&tmp[..n]);
        };
        let header = String::from_utf8_lossy(&buf[..header_end]).into_owned();
        let mut length = 0usize;
        for line in header.split("\r\n").skip(1) {
            if let Some((name, value)) = line.split_once(':') {
                if name.eq_ignore_ascii_case("content-length") {
                    length = value.trim().parse().unwrap_or(0);
                }
            }
        }
        let mut have = buf.len() - (header_end + 4);
        while have < length {
            let n = stream.read(&mut tmp)?;
            if n == 0 {
                break;
            }
            have += n;
        }
        Ok(header)
    }

    fn method_of(header: &str) -> String {
        header
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_string()
    }

    fn serve<F>(handler: F) -> (u16, Arc<AtomicUsize>)
    where
        F: Fn(TcpStream, usize) + Send + Sync + 'static,
    {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let accepts = Arc::new(AtomicUsize::new(0));
        let count = Arc::clone(&accepts);
        let handler = Arc::new(handler);
        thread::spawn(move || {
            while let Ok((stream, _)) = listener.accept() {
                let n = count.fetch_add(1, Ordering::SeqCst);
                let handler = Arc::clone(&handler);
                thread::spawn(move || handler(stream, n));
            }
        });
        (port, accepts)
    }

    #[test]
    fn base64_encode_pads() {
        assert_eq!(super::base64_encode(b""), "");
        assert_eq!(super::base64_encode(b"h"), "aA==");
        assert_eq!(super::base64_encode(b"hi"), "aGk=");
        assert_eq!(super::base64_encode(b"hii"), "aGlp");
        assert_eq!(super::base64_encode(&[0, 255]), "AP8=");
    }

    #[test]
    fn rejects_non_loopback() {
        let err = http_exchange_for_ui(
            "GET",
            "http://example.com/v1/health",
            None,
            b"",
            Duration::from_millis(200),
        )
        .unwrap_err();
        assert!(err.contains("localhost"));
    }

    #[test]
    fn keep_alive_reuses_one_connection() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen2 = Arc::clone(&seen);
        let (port, accepts) = serve(move |mut stream, _| {
            loop {
                let header = match read_one(&mut stream) {
                    Ok(header) => header,
                    Err(_) => return,
                };
                seen2.lock().unwrap().push(header);
                let n = seen2.lock().unwrap().len();
                let body = if n == 1 { "one" } else { "two" };
                if stream.write_all(&http_len(200, body)).is_err() {
                    return;
                }
            }
        });

        let first = exchange(port, "GET", "/v1/health?x=1", None, b"").unwrap();
        let second = http_exchange_for_ui(
            "GET",
            &format!("http://localhost:{port}/v1/health"),
            None,
            b"",
            Duration::from_secs(3),
        )
        .unwrap();
        assert_eq!(first.body, b"one");
        assert_eq!(second.body, b"two");
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        assert_eq!(pooled_len(port), 1);
        let headers = seen.lock().unwrap();
        assert!(headers[0].contains("GET /v1/health?x=1 HTTP/1.1"));
        assert!(headers[0].contains("Connection: keep-alive"));
        assert!(headers[0].contains(&format!("Host: 127.0.0.1:{port}")));
        clear_ui_http_pool();
    }

    #[test]
    fn chunked_body_is_joined() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, _) = serve(|mut stream, _| {
            if read_one(&mut stream).is_err() {
                return;
            }
            let raw = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n5\r\nhello\r\n1;ext=1\r\n!\r\n0\r\n\r\n";
            let _ = stream.write_all(raw);
        });
        let res = exchange(port, "GET", "/chunk", None, b"").unwrap();
        assert_eq!(res.body, b"hello!");
        clear_ui_http_pool();
    }

    #[test]
    fn no_length_takes_buffered_bytes_and_drops_socket() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, accepts) = serve(|mut stream, _| {
            if read_one(&mut stream).is_err() {
                return;
            }
            let raw = b"HTTP/1.1 200 OK\r\nConnection: keep-alive\r\n\r\npartial";
            if stream.write_all(raw).is_err() {
                return;
            }
            let _ = read_one(&mut stream);
        });
        let res = exchange(port, "GET", "/bare", None, b"").unwrap();
        assert_eq!(res.body, b"partial");
        assert_eq!(pooled_len(port), 0);
        let again = exchange(port, "GET", "/bare", None, b"").unwrap();
        assert_eq!(again.body, b"partial");
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
        clear_ui_http_pool();
    }

    #[test]
    fn connection_close_reads_until_eof() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, _) = serve(|mut stream, _| {
            if read_one(&mut stream).is_err() {
                return;
            }
            let raw = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nbye";
            let _ = stream.write_all(raw);
        });
        let res = exchange(port, "GET", "/close", None, b"").unwrap();
        assert_eq!(res.body, b"bye");
        assert_eq!(pooled_len(port), 0);
        clear_ui_http_pool();
    }

    #[test]
    fn pooled_break_before_status_retries_post_once() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let log = Arc::new(Mutex::new(Vec::<Vec<String>>::new()));
        let log2 = Arc::clone(&log);
        let (port, accepts) = serve(move |mut stream, id| {
            let mut methods = Vec::new();
            if id == 0 {
                let header = read_one(&mut stream).unwrap();
                methods.push(method_of(&header));
                stream.write_all(&http_len(200, "first")).unwrap();
                if let Ok(header) = read_one(&mut stream) {
                    methods.push(method_of(&header));
                }
                log2.lock().unwrap().push(methods);
                return;
            }
            let header = read_one(&mut stream).unwrap();
            methods.push(method_of(&header));
            log2.lock().unwrap().push(methods);
            stream.write_all(&http_len(200, "retried")).unwrap();
        });
        let first = exchange(port, "GET", "/job", None, b"").unwrap();
        assert_eq!(first.body, b"first");
        let second = exchange(
            port,
            "POST",
            "/v1/jobs",
            Some("application/json"),
            b"{\"a\":1}",
        )
        .unwrap();
        assert_eq!(second.body, b"retried");
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
        let rows = log.lock().unwrap().clone();
        assert!(rows.iter().any(|row| row == &vec!["GET".to_string(), "POST".to_string()]));
        assert!(rows.iter().any(|row| row == &vec!["POST".to_string()]));
        clear_ui_http_pool();
    }

    #[test]
    fn post_is_not_retried_after_status_line() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, accepts) = serve(|mut stream, id| {
            if id != 0 {
                let _ = read_one(&mut stream);
                let _ = stream.write_all(&http_len(200, "nope"));
                return;
            }
            let _ = read_one(&mut stream).unwrap();
            stream.write_all(&http_len(200, "first")).unwrap();
            let _ = read_one(&mut stream).unwrap();
            let _ = stream.write_all(
                b"HTTP/1.1 201 Created\r\nContent-Length: 5\r\nConnection: keep-alive\r\n\r\n",
            );
        });
        assert_eq!(exchange(port, "GET", "/job", None, b"").unwrap().body, b"first");
        let err = exchange(port, "POST", "/v1/jobs", Some("application/json"), b"{}").unwrap_err();
        assert!(err.contains("eof") || err.contains("body"));
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        clear_ui_http_pool();
    }

    #[test]
    fn fresh_connection_is_not_retried() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, accepts) = serve(|mut stream, _| {
            let _ = read_one(&mut stream);
        });
        let err = exchange(port, "GET", "/v1/health", None, b"").unwrap_err();
        assert!(err.contains("eof") || err.contains("read"));
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        clear_ui_http_pool();
    }

    #[test]
    fn pool_keeps_at_most_four_sockets() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let arrived = Arc::new(AtomicUsize::new(0));
        let arrived2 = Arc::clone(&arrived);
        let (port, accepts) = serve(move |mut stream, _| {
            if read_one(&mut stream).is_err() {
                return;
            }
            arrived2.fetch_add(1, Ordering::SeqCst);
            while arrived2.load(Ordering::SeqCst) < 5 {
                thread::sleep(Duration::from_millis(5));
            }
            let _ = stream.write_all(&http_len(200, "x"));
            let _ = read_one(&mut stream);
        });
        thread::scope(|scope| {
            for _ in 0..5 {
                scope.spawn(|| {
                    let res = exchange(port, "GET", "/tile", None, b"").unwrap();
                    assert_eq!(res.body, b"x");
                });
            }
        });
        assert_eq!(accepts.load(Ordering::SeqCst), 5);
        assert_eq!(arrived.load(Ordering::SeqCst), 5);
        assert_eq!(pooled_len(port), 4);
        clear_ui_http_pool();
    }

    #[test]
    fn clearing_the_pool_opens_a_new_connection() {
        let _guard = lock_tests();
        clear_ui_http_pool();
        let (port, accepts) = serve(|mut stream, _| {
            loop {
                if read_one(&mut stream).is_err() {
                    return;
                }
                if stream.write_all(&http_len(200, "ok")).is_err() {
                    return;
                }
            }
        });
        assert_eq!(exchange(port, "GET", "/v1/health", None, b"").unwrap().body, b"ok");
        assert_eq!(pooled_len(port), 1);
        clear_ui_http_pool();
        assert_eq!(pooled_len(port), 0);
        assert_eq!(exchange(port, "GET", "/v1/health", None, b"").unwrap().body, b"ok");
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
        clear_ui_http_pool();
    }
}
