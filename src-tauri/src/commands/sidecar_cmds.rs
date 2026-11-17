//! Tauri commands: sidecar process + host HTTP exchange.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::State;

use crate::sidecar;
use crate::ui_http;
use crate::SidecarState;

#[tauri::command(async)]
pub fn sidecar_start(
    app: tauri::AppHandle,
    state: State<'_, Arc<Mutex<SidecarState>>>,
    port: Option<u16>,
    spec_cache_dir: Option<String>,
    job_logs_dir: Option<String>,
) -> Result<(), String> {
    if std::env::var("ORCAI_SKIP_SIDECAR").is_ok() {
        return Err("Sidecar disabled (ORCAI_SKIP_SIDECAR)".into());
    }
    sidecar::set_start_extras(spec_cache_dir, job_logs_dir);
    if sidecar::begin_sidecar_start(state.inner(), port)? {
        sidecar::start_sidecar_background(app, state.inner().clone());
    }
    Ok(())
}

#[tauri::command(async)]
pub fn sidecar_stop(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<(), String> {
    sidecar::stop_sidecar_process(state.inner())
}

#[tauri::command(async)]
pub fn sidecar_is_running(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<bool, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.starting {
        return Ok(true);
    }
    if let Some(child) = guard.child.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => Ok(false),
            Ok(None) => {
                if let Some(port) = guard.port {
                    Ok(sidecar::is_port_listening(port))
                } else {
                    Ok(true)
                }
            }
            Err(_) => Ok(false),
        }
    } else {
        Ok(false)
    }
}

#[tauri::command(async)]
pub fn sidecar_get_port(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<Option<u16>, String> {
    Ok(sidecar::sidecar_listen_port(state.inner()))
}

/// Start orcAI engine via host HTTP (not WKWebView fetch) and wait until ready.
///
/// `async` command: the sync body runs on Tauri's blocking pool (not the UI
/// thread). Warmup can take minutes; UI awaits the invoke promise.
#[tauri::command(async)]
pub fn sidecar_engine_start(
    state: State<'_, Arc<Mutex<SidecarState>>>,
    compute_device: String,
) -> Result<(), String> {
    let port = sidecar::sidecar_listen_port(state.inner()).ok_or_else(|| {
        "Sidecar is not listening — start Sidecar first".to_string()
    })?;
    sidecar::start_engine_and_wait(port, &compute_device, 600)
}

/// One HTTP exchange for the UI. The body is base64 so WKWebView does not
/// turn raw bytes into a JSON array of numbers.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarHttpExchange {
    status: u16,
    content_type: String,
    body_base64: String,
}

#[tauri::command(async)]
pub fn sidecar_http_exchange(
    method: String,
    url: String,
    content_type: Option<String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<SidecarHttpExchange, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(300_000).clamp(1, 300_000));
    let payload = body.unwrap_or_default();
    let response = ui_http::http_exchange_for_ui(
        &method,
        &url,
        content_type.as_deref(),
        payload.as_bytes(),
        timeout,
    )?;
    Ok(SidecarHttpExchange {
        status: response.status,
        content_type: response.content_type,
        body_base64: ui_http::base64_encode(&response.body),
    })
}
