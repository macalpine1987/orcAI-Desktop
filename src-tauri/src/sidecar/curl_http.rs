//! curl-based host HTTP helpers for engine / job control.

use std::process::Command;
use std::time::{Duration, Instant};

use super::port::is_port_listening;

pub(crate) fn try_cancel_active_jobs_http(port: u16) {
    if !is_port_listening(port) {
        return;
    }
    #[cfg(unix)]
    {
        let script = format!(
            "curl -sf -m 20 -X POST http://127.0.0.1:{port}/v1/jobs/cancel-active >/dev/null 2>&1 || true"
        );
        let _ = Command::new("sh").arg("-c").arg(script).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "try {{ Invoke-WebRequest -Uri 'http://127.0.0.1:{port}/v1/jobs/cancel-active' -Method POST -TimeoutSec 20 | Out-Null }} catch {{ }}"
                ),
            ])
            .status();
    }
}

pub(crate) fn try_stop_engine_http(port: u16) {
    if !is_port_listening(port) {
        return;
    }
    #[cfg(unix)]
    {
        let script = format!(
            "curl -sf -m 3 -X POST http://127.0.0.1:{port}/v1/engine/stop >/dev/null 2>&1 || true"
        );
        let _ = Command::new("sh").arg("-c").arg(script).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "try {{ Invoke-WebRequest -Uri 'http://127.0.0.1:{port}/v1/engine/stop' -Method POST -TimeoutSec 3 | Out-Null }} catch {{ }}"
                ),
            ])
            .status();
    }
}

pub(crate) fn is_orcai_sidecar(port: u16) -> bool {
    http_get(&format!("http://127.0.0.1:{port}/health"), 2)
        .map(|text| text.contains(r#""status":"ok""#) && text.contains(r#""orcai":"#))
        .unwrap_or(false)
}

/// GET helper used by host-side engine orchestration (avoids WKWebView fetch races).
pub fn http_get(url: &str, timeout_secs: u64) -> Result<String, String> {
    let output = Command::new("curl")
        .args(["-sf", "-m", &timeout_secs.to_string(), url])
        .output()
        .map_err(|e| format!("curl get failed: {e}"))?;
    if !output.status.success() {
        return Err(format!("curl get status {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// POST JSON helper used by host-side engine start.
pub fn http_post_json(url: &str, body: &str, timeout_secs: u64) -> Result<String, String> {
    let output = Command::new("curl")
        .args([
            "-sf",
            "-m",
            &timeout_secs.to_string(),
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            body,
            url,
        ])
        .output()
        .map_err(|e| format!("curl post failed: {e}"))?;
    if !output.status.success() {
        return Err(format!("curl post status {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Wait until /health is reachable, POST /v1/engine/start, wait until engine ready.
pub fn start_engine_and_wait(port: u16, compute_device: &str, timeout_secs: u64) -> Result<(), String> {
    let device = if compute_device == "gpu" { "gpu" } else { "cpu" };
    let health_url = format!("http://127.0.0.1:{port}/health");
    let start_url = format!("http://127.0.0.1:{port}/v1/engine/start");
    let body = format!(r#"{{"compute_device":"{device}"}}"#);

    let listen_deadline = Instant::now() + Duration::from_secs(90);
    while Instant::now() < listen_deadline {
        if http_get(&health_url, 2).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if http_get(&health_url, 2).is_err() {
        return Err(format!("Sidecar health not reachable on :{port}"));
    }

    let _ = http_post_json(&start_url, &body, 15)?;

    let ready_deadline = Instant::now() + Duration::from_secs(timeout_secs.max(30));
    while Instant::now() < ready_deadline {
        if let Ok(text) = http_get(&health_url, 3) {
            if text.contains(r#""engine":"ready""#) {
                return Ok(());
            }
            if text.contains(r#""engine":"error""#) {
                return Err(format!("Engine error: {text}"));
            }
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    Err("Engine warmup timed out".into())
}

/// Stop any process listening on the sidecar port (e.g. old sidecar after crash).
pub(crate) fn free_sidecar_port(port: u16) {
    try_cancel_active_jobs_http(port);
    #[cfg(unix)]
    {
        let script = format!(
            "pids=$(lsof -ti tcp:{port} -sTCP:LISTEN 2>/dev/null); \
             if [ -n \"$pids\" ]; then kill -15 $pids 2>/dev/null; sleep 0.5; \
             still=$(lsof -ti tcp:{port} -sTCP:LISTEN 2>/dev/null); [ -n \"$still\" ] && kill -9 $still; fi"
        );
        let _ = Command::new("sh").arg("-c").arg(script).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("cmd")
            .args([
                "/C",
                &format!(
                    "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{port}') do taskkill /F /PID %a"
                ),
            ])
            .status();
    }
}
