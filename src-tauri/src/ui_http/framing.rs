//! HTTP response framing for the UI keep-alive client.

use std::io::{self, ErrorKind, Read};
use std::net::TcpStream;

use super::pool::Pooled;

pub(crate) const HEADER_CAP: usize = 64 * 1024;
/// Soft cap for host↔sidecar UI HTTP bodies (base64’d into WKWebView).
/// 32 MiB balances large spectrogram/audio payloads vs RSS spikes (was 64).
pub(crate) const BODY_CAP: usize = 32 * 1024 * 1024;

pub(crate) struct Reader {
    pub(crate) stream: TcpStream,
    pub(crate) buf: Vec<u8>,
    pub(crate) pos: usize,
}

impl Reader {
    pub(crate) fn new(stream: TcpStream, pending: Vec<u8>) -> Self {
        Self {
            stream,
            buf: pending,
            pos: 0,
        }
    }

    fn pull(&mut self) -> io::Result<usize> {
        let mut tmp = [0u8; 8192];
        let n = self.stream.read(&mut tmp)?;
        if n > 0 {
            self.buf.extend_from_slice(&tmp[..n]);
        }
        Ok(n)
    }

    pub(crate) fn read_headers(&mut self) -> io::Result<String> {
        loop {
            if let Some(rel) = find_slice(&self.buf[self.pos..], b"\r\n\r\n") {
                let end = self.pos + rel;
                let text = String::from_utf8_lossy(&self.buf[self.pos..end]).into_owned();
                self.pos = end + 4;
                return Ok(text);
            }
            if self.buf.len() > HEADER_CAP {
                return Err(io::Error::new(ErrorKind::InvalidData, "headers too large"));
            }
            if self.pull()? == 0 {
                return Err(io::Error::new(
                    ErrorKind::UnexpectedEof,
                    "eof before headers",
                ));
            }
        }
    }

    pub(crate) fn read_exact(&mut self, n: usize) -> io::Result<Vec<u8>> {
        while self.buf.len() - self.pos < n {
            if self.buf.len() > BODY_CAP + HEADER_CAP {
                return Err(io::Error::new(ErrorKind::InvalidData, "body too large"));
            }
            if self.pull()? == 0 {
                return Err(io::Error::new(ErrorKind::UnexpectedEof, "eof in body"));
            }
        }
        let out = self.buf[self.pos..self.pos + n].to_vec();
        self.pos += n;
        Ok(out)
    }

    pub(crate) fn read_line(&mut self) -> io::Result<String> {
        loop {
            if let Some(rel) = find_slice(&self.buf[self.pos..], b"\r\n") {
                let line = String::from_utf8_lossy(&self.buf[self.pos..self.pos + rel]).into_owned();
                self.pos += rel + 2;
                return Ok(line);
            }
            if self.buf.len() > HEADER_CAP + BODY_CAP {
                return Err(io::Error::new(ErrorKind::InvalidData, "line too large"));
            }
            if self.pull()? == 0 {
                return Err(io::Error::new(ErrorKind::UnexpectedEof, "eof in line"));
            }
        }
    }

    pub(crate) fn read_to_eof(&mut self) -> io::Result<Vec<u8>> {
        loop {
            if self.buf.len() > BODY_CAP {
                return Err(io::Error::new(ErrorKind::InvalidData, "body too large"));
            }
            if self.pull()? == 0 {
                break;
            }
        }
        let out = self.buf[self.pos..].to_vec();
        self.pos = self.buf.len();
        Ok(out)
    }

    pub(crate) fn tail(&self) -> Vec<u8> {
        self.buf[self.pos..].to_vec()
    }

    pub(crate) fn into_pooled(self) -> Pooled {
        let pending = self.tail();
        Pooled {
            stream: self.stream,
            pending,
        }
    }
}

pub(crate) fn find_slice(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|win| win == needle)
}

pub(crate) struct Head {
    pub(crate) status: u16,
    pub(crate) content_length: Option<usize>,
    pub(crate) chunked: bool,
    pub(crate) close: bool,
    pub(crate) content_type: String,
}

pub(crate) fn parse_head(raw: &str) -> Result<Head, String> {
    let mut lines = raw.split("\r\n");
    let status_line = lines.next().unwrap_or("");
    let mut parts = status_line.split_whitespace();
    let _version = parts.next();
    let code = parts
        .next()
        .ok_or_else(|| "missing status code".to_string())?
        .parse::<u16>()
        .map_err(|_| "bad status code".to_string())?;
    let mut content_length = None;
    let mut chunked = false;
    let mut close = false;
    let mut content_type = "application/octet-stream".to_string();
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        if name.trim().eq_ignore_ascii_case("content-length") {
            content_length = Some(
                value
                    .parse::<usize>()
                    .map_err(|_| "bad content-length".to_string())?,
            );
        } else if name.trim().eq_ignore_ascii_case("transfer-encoding")
            && value.to_ascii_lowercase().contains("chunked")
        {
            chunked = true;
        } else if name.trim().eq_ignore_ascii_case("connection")
            && value.to_ascii_lowercase().contains("close")
        {
            close = true;
        } else if name.trim().eq_ignore_ascii_case("content-type") {
            content_type = value.to_string();
        }
    }
    Ok(Head {
        status: code,
        content_length,
        chunked,
        close,
        content_type,
    })
}

pub(crate) fn read_chunked(reader: &mut Reader) -> io::Result<Vec<u8>> {
    let mut out = Vec::new();
    loop {
        let line = reader.read_line()?;
        let hex = line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(hex, 16)
            .map_err(|_| io::Error::new(ErrorKind::InvalidData, "bad chunk size"))?;
        if size == 0 {
            loop {
                if reader.read_line()?.is_empty() {
                    break;
                }
            }
            break;
        }
        if out.len().saturating_add(size) > BODY_CAP {
            return Err(io::Error::new(ErrorKind::InvalidData, "body too large"));
        }
        out.extend(reader.read_exact(size)?);
        if reader.read_exact(2)? != b"\r\n" {
            return Err(io::Error::new(ErrorKind::InvalidData, "bad chunk ending"));
        }
    }
    Ok(out)
}
