//! Tauri commands: window chrome + UI scale.

use tauri::Manager;

use crate::{hide_on_close_enabled, scale_accepted, UI_SCALE};

/// Close-button policy owned by the shell (not the UI platform() check).
#[tauri::command]
pub fn window_close_policy() -> String {
    if hide_on_close_enabled() {
        "hide".into()
    } else {
        "stop_and_close".into()
    }
}

/// Full-screen stub.
#[tauri::command]
pub fn window_set_fullscreen(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_fullscreen(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_is_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        return window.is_fullscreen().map_err(|e| e.to_string());
    }
    Ok(false)
}

/// DPI / UI scale stub — in-memory only.
#[tauri::command]
pub fn ui_get_scale() -> f64 {
    match UI_SCALE.lock() {
        Ok(guard) => *guard,
        Err(poisoned) => *poisoned.into_inner(),
    }
}

#[tauri::command]
pub fn ui_set_scale(scale: f64) -> Result<(), String> {
    if !scale_accepted(scale) {
        return Err(format!(
            "unsupported ui scale {scale}; allowed: 1.0, 1.25"
        ));
    }
    match UI_SCALE.lock() {
        Ok(mut guard) => *guard = scale,
        Err(poisoned) => *poisoned.into_inner() = scale,
    }
    Ok(())
}
