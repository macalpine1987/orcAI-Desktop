//! Request attempt + public http_exchange_for_ui entrypoint.

use std::io::Write;
use std::time::Duration;

use url::Url;

use super::framing::{parse_head, read_chunked, Head, Reader, BODY_CAP};
use super::pool::{connect, park, take_live, Fail, Pooled};

#[derive(Debug)]
pub struct UiHttpResponse {
    pub status: u16,
    pub content_type: String,
    pub body: Vec<u8>,
}

fn build_request(
    method: &str,
    path: &str,
    port: u16,
    content_type: Option<&str>,
    body: &[u8],
) -> Vec<u8> {
    let mut out = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: keep-alive\r\n"
    )
    .into_bytes();
    let sends_body = !body.is_empty()
        || method.eq_ignore_ascii_case("POST")
        || method.eq_ignore_ascii_case("PUT")
        || method.eq_ignore_ascii_case("PATCH");
    if sends_body {
        if let Some(ct) = content_type {
            if !ct.is_empty() {
                out.extend(format!("Content-Type: {ct}\r\n").into_bytes());
            }
        }
        out.extend(format!("Content-Length: {}\r\n", body.len()).into_bytes());
    }
    out.extend(b"\r\n");
    out.extend(body);
    out
}

fn attempt(
    port: u16,
    request: &[u8],
    timeout: Duration,
    pooled: Option<Pooled>,
) -> Result<(UiHttpResponse, Option<Pooled>), Fail> {
    let (stream, pending) = match pooled {
        Some(conn) => (conn.stream, conn.pending),
        None => (connect(port, timeout)?, Vec::new()),
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let mut reader = Reader::new(stream, pending);
    if reader
        .stream
        .write_all(request)
        .and_then(|()| reader.stream.flush())
        .is_err()
    {
        return Err(Fail {
            message: "write failed".to_string(),
            saw_status: false,
        });
    }
    let raw = reader.read_headers().map_err(|err| Fail {
        message: format!("read: {err}"),
        saw_status: false,
    })?;
    let head = parse_head(&raw).map_err(|err| Fail {
        message: err,
        saw_status: true,
    })?;
    let (body, reusable) = read_body(&mut reader, &head)?;
    let idle = if reusable {
        Some(reader.into_pooled())
    } else {
        None
    };
    Ok((
        UiHttpResponse {
            status: head.status,
            content_type: head.content_type,
            body,
        },
        idle,
    ))
}

fn read_body(reader: &mut Reader, head: &Head) -> Result<(Vec<u8>, bool), Fail> {
    if head.chunked {
        let body = read_chunked(reader).map_err(|err| Fail {
            message: format!("chunked: {err}"),
            saw_status: true,
        })?;
        return Ok((body, !head.close));
    }
    if let Some(len) = head.content_length {
        if len > BODY_CAP {
            return Err(Fail {
                message: "body too large".to_string(),
                saw_status: true,
            });
        }
        let body = reader.read_exact(len).map_err(|err| Fail {
            message: format!("body: {err}"),
            saw_status: true,
        })?;
        return Ok((body, !head.close));
    }
    if head.close {
        let body = reader.read_to_eof().map_err(|err| Fail {
            message: format!("body: {err}"),
            saw_status: true,
        })?;
        return Ok((body, false));
    }
    let body = reader.tail();
    reader.pos = reader.buf.len();
    Ok((body, false))
}

pub fn http_exchange_for_ui(
    method: &str,
    url: &str,
    content_type: Option<&str>,
    body: &[u8],
    timeout: Duration,
) -> Result<UiHttpResponse, String> {
    let method = normalize_method(method)?;
    if let Some(ct) = content_type {
        if ct.bytes().any(|b| b == b'\r' || b == b'\n') {
            return Err("bad content type".to_string());
        }
    }
    let parsed = Url::parse(url).map_err(|err| format!("bad url: {err}"))?;
    if parsed.scheme() != "http" {
        return Err("sidecar http exchange only supports http".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if host != "127.0.0.1" && host != "localhost" {
        return Err("sidecar http exchange is localhost only".to_string());
    }
    let port = parsed
        .port()
        .ok_or_else(|| "sidecar url is missing a port".to_string())?;
    let path = &parsed[url::Position::BeforePath..url::Position::BeforeFragment];
    let request = build_request(&method, path, port, content_type, body);
    let pooled = take_live(port);
    let from_pool = pooled.is_some();
    match attempt(port, &request, timeout, pooled) {
        Ok((response, idle)) => {
            if let Some(idle) = idle {
                park(port, idle);
            }
            Ok(response)
        }
        Err(err) if from_pool && !err.saw_status => {
            match attempt(port, &request, timeout, None) {
                Ok((response, idle)) => {
                    if let Some(idle) = idle {
                        park(port, idle);
                    }
                    Ok(response)
                }
                Err(retry) => Err(format!("{method} {path}: {}", retry.message)),
            }
        }
        Err(err) => Err(format!("{method} {path}: {}", err.message)),
    }
}

fn normalize_method(method: &str) -> Result<String, String> {
    let method = method.trim();
    let method = if method.is_empty() { "GET" } else { method };
    if !method.bytes().all(|b| b.is_ascii_alphabetic()) {
        return Err("bad method".to_string());
    }
    Ok(method.to_ascii_uppercase())
}
