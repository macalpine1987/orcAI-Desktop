//! Sidecar process spawn, watch, and host-side engine HTTP.

mod curl_http;
mod launch;
mod port;

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use super::SidecarState;
use curl_http::{
    free_sidecar_port, is_orcai_sidecar, try_cancel_active_jobs_http, try_stop_engine_http,
};
use launch::{resolve_launch_spec, sidecar_log_path, spawn_with_spec};
use port::port_listening_with_retries;

#[allow(unused_imports)]
pub use crate::ui_http::http_exchange_for_ui;

/// Dev / manual sidecar default when not started by the desktop host.
/// Keep in sync with `SIDECAR_DEFAULT_PORT` in `apps/ui/src/api/sidecar.ts`
/// and `orcai_desktop_sidecar.main`.
pub const SIDECAR_DEFAULT_PORT: u16 = 8741;

#[allow(unused_imports)] // re-exported for lib.rs host orchestration
pub use curl_http::{http_get, http_post_json, start_engine_and_wait};
pub use launch::set_start_extras;
pub use port::{is_port_listening, pick_ephemeral_port};

fn watch_sidecar_process(app: AppHandle, state: Arc<Mutex<SidecarState>>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let exit_status = {
                let mut guard = match state.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                let Some(child) = guard.child.as_mut() else {
                    return;
                };
                match child.try_wait() {
                    Ok(Some(status)) => status,
                    Ok(None) => continue,
                    Err(err) => {
                        eprintln!("orcAI Desktop: sidecar poll error: {err}");
                        return;
                    }
                }
            };

            if let Ok(mut guard) = state.lock() {
                guard.starting = false;
                guard.child = None;
                guard.port = None;
            }
            crate::ui_http::clear_ui_http_pool();

            let message = format!("Sidecar process exited ({exit_status}).");
            eprintln!("orcAI Desktop: {message}");
            if let Ok(home) = app.path().home_dir() {
                let marker = home.join(".orcai-desktop").join("sidecar-crashed");
                if let Some(parent) = marker.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&marker, "1");
            }
            let _ = app.emit("sidecar-exited", message);
            return;
        }
    });
}

pub fn spawn_sidecar(app: &AppHandle, port: u16) -> Result<Child, String> {
    let spec = resolve_launch_spec(app).ok_or_else(|| {
        "Bundled Python was not found inside the application. Reinstall orcAI Desktop.".to_string()
    })?;
    spawn_with_spec(&spec, port)
}

fn emit_sidecar_failed(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit("sidecar-failed", message.into());
}

fn emit_sidecar_boot_progress(app: &AppHandle, stage: &str, progress: f64) {
    let _ = app.emit(
        "sidecar-boot-progress",
        json!({
            "stage": stage,
            "progress": progress.clamp(0.0, 1.0),
        }),
    );
}

fn child_exit_hint(child: &mut Child) -> Option<String> {
    match child.try_wait() {
        Ok(Some(status)) => Some(format!("Sidecar process exited ({status})")),
        Ok(None) => None,
        Err(err) => Some(format!("Could not poll sidecar process: {err}")),
    }
}

fn tail_sidecar_log(app: &AppHandle, port: Option<u16>) -> Option<String> {
    let path = sidecar_log_path(app)?;
    let text = std::fs::read_to_string(&path).ok()?;
    let marker = port.map(|p| format!("port={p}"));
    let blocks: Vec<&str> = text.split("\n--- sidecar start ").collect();
    let tail_block = if let Some(ref m) = marker {
        blocks
            .iter()
            .rev()
            .find(|block| block.contains(m.as_str()))
            .copied()
    } else {
        blocks.last().copied()
    };
    let tail_block = tail_block.unwrap_or(text.as_str());
    let tail: String = tail_block
        .lines()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    if tail.is_empty() {
        None
    } else {
        Some(tail)
    }
}

/// Spawn Python sidecar on a background thread; store child for lifecycle; notify UI when port is up.
pub fn start_sidecar_background(app: AppHandle, state: Arc<Mutex<SidecarState>>) {
    std::thread::spawn(move || {
        emit_sidecar_boot_progress(&app, "spawning", 0.05);
        let (port, session) = {
            let mut guard = match state.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            match guard.port {
                Some(p) => (p, guard.session),
                None => {
                    guard.starting = false;
                    drop(guard);
                    emit_sidecar_failed(&app, "Sidecar port was not allocated.");
                    return;
                }
            }
        };

        let mut child = match spawn_sidecar(&app, port) {
            Ok(child) => child,
            Err(mut msg) => {
                if let Ok(mut guard) = state.lock() {
                    if guard.session != session {
                        return;
                    }
                    guard.starting = false;
                    guard.port = None;
                }
                if let Some(log) = tail_sidecar_log(&app, Some(port)) {
                    msg.push_str("\n\nLog tail:\n");
                    msg.push_str(&log);
                }
                emit_sidecar_failed(&app, msg);
                return;
            }
        };

        if let Ok(mut guard) = state.lock() {
            if guard.session != session {
                // Stopped (or restarted) while spawning: this child belongs to no session.
                drop(guard);
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
            guard.child = Some(child);
        } else {
            let _ = child.kill();
            return;
        }
        remember_session_port(Some(port));

        let is_current = || state.lock().map(|g| g.session == session).unwrap_or(false);
        if wait_for_sidecar_port(&app, port, is_current) {
            if let Ok(mut guard) = state.lock() {
                if guard.session != session {
                    return;
                }
                guard.starting = false;
            }
            emit_sidecar_boot_progress(&app, "ready", 1.0);
            let _ = app.emit("sidecar-ready", json!({ "port": port }));
            watch_sidecar_process(app.clone(), state);
        } else {
            let mut message = format!(
                "Sidecar did not open port {port} in time. Check ~/Library/Logs for sidecar.log."
            );
            if let Ok(mut guard) = state.lock() {
                if guard.session != session {
                    return;
                }
                guard.starting = false;
                guard.port = None;
                if let Some(mut child) = guard.child.take() {
                    if let Some(hint) = child_exit_hint(&mut child) {
                        message = format!("{message}\n{hint}");
                    }
                    let _ = child.kill();
                }
            }
            if let Some(log) = tail_sidecar_log(&app, Some(port)) {
                message.push_str("\n\n");
                message.push_str(&log);
            }
            emit_sidecar_failed(&app, message);
        }
    });
}

static LAST_PORT_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

fn last_port_file() -> Option<PathBuf> {
    LAST_PORT_FILE.lock().ok().and_then(|g| g.clone())
}

/// Remember the session port so a force-quit leftover can be found on the next launch.
fn remember_session_port(port: Option<u16>) {
    let Some(path) = last_port_file() else {
        return;
    };
    match port {
        Some(port) => {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&path, port.to_string());
        }
        None => {
            let _ = std::fs::remove_file(&path);
        }
    }
}


pub fn cleanup_stale_sidecars_on_launch(app: &AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        if let Ok(mut guard) = LAST_PORT_FILE.lock() {
            *guard = Some(dir.join("sidecar-last-port"));
        }
    }
    if is_port_listening(SIDECAR_DEFAULT_PORT) {
        eprintln!(
            "orcAI Desktop: freeing stale sidecar on port {SIDECAR_DEFAULT_PORT}"
        );
        free_sidecar_port(SIDECAR_DEFAULT_PORT);
    }
    let last_port = last_port_file()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| text.trim().parse::<u16>().ok());
    if let Some(port) = last_port {
        if port != SIDECAR_DEFAULT_PORT && is_port_listening(port) && is_orcai_sidecar(port) {
            eprintln!("orcAI Desktop: freeing sidecar left on port {port} by a previous run");
            free_sidecar_port(port);
        }
    }
    remember_session_port(None);
}

pub fn stop_sidecar_process(state: &Arc<Mutex<SidecarState>>) -> Result<(), String> {
    crate::ui_http::clear_ui_http_pool();
    // Detach the session under the lock, then talk to the process without holding it
    // (cancel-active may take up to 20 s; status polls must not block meanwhile).
    let (port, child) = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.starting = false;
        guard.session = guard.session.wrapping_add(1);
        (guard.port.take(), guard.child.take())
    };
    remember_session_port(None);
    if let Some(port) = port {
        try_stop_engine_http(port);
        try_cancel_active_jobs_http(port);
    }
    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Some(port) = port {
        if is_port_listening(port) {
            free_sidecar_port(port);
        }
    }
    Ok(())
}

/// Returns `true` when a new background spawn should run.
pub fn begin_sidecar_start(
    state: &Arc<Mutex<SidecarState>>,
    pinned_port: Option<u16>,
) -> Result<bool, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.starting {
        return Ok(false);
    }
    if guard.child.is_some() {
        let port = guard.port;
        let mut child = guard.child.take().expect("child is_some");
        match child.try_wait() {
            Ok(Some(_)) => {}
            Ok(None) => {
                if let Some(port) = port {
                    // Cap wait while holding the state mutex (was 48×250ms ≈ 12s).
                    if port_listening_with_retries(port, 8, Duration::from_millis(100)) {
                        guard.child = Some(child);
                        return Ok(false);
                    }
                }
                if guard.starting {
                    guard.child = Some(child);
                    return Ok(false);
                }
                let _ = child.kill();
            }
            Err(_) => {
                let _ = child.kill();
            }
        }
    }
    if let Some(port) = guard.port {
        if guard.child.is_none() && is_port_listening(port) {
            eprintln!(
                "orcAI Desktop: freeing port {port} (orphaned sidecar from a previous run)"
            );
            free_sidecar_port(port);
            std::thread::sleep(Duration::from_millis(400));
        }
    }
    let port = if let Some(pinned) = pinned_port {
        if is_port_listening(pinned) {
            eprintln!("orcAI Desktop: freeing pinned sidecar port {pinned}");
            free_sidecar_port(pinned);
            std::thread::sleep(Duration::from_millis(400));
        }
        if is_port_listening(pinned) {
            return Err(format!("Sidecar port {pinned} is already in use"));
        }
        pinned
    } else {
        pick_ephemeral_port().ok_or_else(|| "No free local port for sidecar".to_string())?
    };
    guard.port = Some(port);
    guard.starting = true;
    guard.session = guard.session.wrapping_add(1);
    crate::ui_http::clear_ui_http_pool();
    eprintln!("orcAI Desktop: allocated sidecar port {port}");
    Ok(true)
}

pub fn sidecar_listen_port(state: &Arc<Mutex<SidecarState>>) -> Option<u16> {
    let guard = state.lock().ok()?;
    let port = guard.port?;
    if is_port_listening(port) {
        return Some(port);
    }
    // Publish allocated port while spawning so the UI can bind before listen.
    if guard.starting || guard.child.is_some() {
        return Some(port);
    }
    None
}

pub fn wait_for_sidecar_port(app: &AppHandle, port: u16, is_current: impl Fn() -> bool) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let started = std::time::Instant::now();
    let deadline = started + Duration::from_secs(90);
    emit_sidecar_boot_progress(app, "waiting_port", 0.12);
    while std::time::Instant::now() < deadline {
        if !is_current() {
            return false;
        }
        if TcpStream::connect_timeout(
            &addr.parse().expect("valid addr"),
            Duration::from_millis(400),
        )
        .is_ok()
        {
            eprintln!("orcAI Desktop: sidecar listening on :{port}");
            return true;
        }
        let elapsed = started.elapsed().as_secs_f64();
        let frac = (elapsed / 90.0).min(1.0);
        let progress = 0.12 + frac * 0.83;
        emit_sidecar_boot_progress(app, "waiting_port", progress);
        std::thread::sleep(Duration::from_millis(350));
    }
    eprintln!("orcAI Desktop: sidecar port {port} not ready in time");
    false
}
