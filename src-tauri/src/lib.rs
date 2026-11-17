mod opened_files;
mod sidecar;
mod ui_http;
mod commands;

use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex};

use opened_files::{
    collect_paths_from_args, dispatch_cli_open_files, emit_opened_files,
    queue_opened_files, show_main_window, take_pending_open_files, PendingOpenFiles,
};
use tauri::{Manager, RunEvent};
use tauri_plugin_store::StoreExt;

pub struct SidecarState {
    pub child: Option<Child>,
    pub starting: bool,
    pub port: Option<u16>,
    /// Bumped on every start and stop; a boot thread from an older session must not touch state.
    pub session: u64,
}

/// In-memory UI scale (DPI stub). Accepted: 1.0, 1.25.
pub(crate) static UI_SCALE: Mutex<f64> = Mutex::new(1.0);

/// macOS: X / ⌘W hide the main Lab window; Quit uses RunEvent::Exit.
/// Contract: docs/RUNTIME_CONTRACT.md
pub(crate) const fn hide_on_close_enabled() -> bool {
    cfg!(target_os = "macos")
}

/// When true, main window opens in fullscreen on launch.
static LAUNCH_FULLSCREEN: Mutex<bool> = Mutex::new(false);

fn read_launch_fullscreen() -> bool {
    match LAUNCH_FULLSCREEN.lock() {
        Ok(guard) => *guard,
        Err(poisoned) => *poisoned.into_inner(),
    }
}

pub(crate) fn scale_accepted(scale: f64) -> bool {
    const ALLOWED: [f64; 2] = [1.0, 1.25];
    ALLOWED.iter().any(|v| (scale - v).abs() < 1e-9)
}

fn ui_scale_factor_from_preset(preset: &str) -> Option<f64> {
    match preset {
        "100" | "system" => Some(1.0),
        "125" | "150" => Some(1.25),
        _ => None,
    }
}

/// Read `preferences.json` before WebView loads (must match JS `preferencesStore.ts`).
fn apply_shell_prefs_from_store(app: &tauri::AppHandle) {
    let Ok(store) = app.store("preferences.json") else {
        return;
    };
    let Some(blob) = store.get("preferences") else {
        return;
    };
    let Some(obj) = blob.as_object() else {
        return;
    };

    if let Some(preset) = obj.get("uiScale").and_then(|v| v.as_str()) {
        if let Some(scale) = ui_scale_factor_from_preset(preset) {
            match UI_SCALE.lock() {
                Ok(mut guard) => *guard = scale,
                Err(poisoned) => *poisoned.into_inner() = scale,
            }
        }
    }

    if let Some(fullscreen) = obj.get("launchFullscreen").and_then(|v| v.as_bool()) {
        match LAUNCH_FULLSCREEN.lock() {
            Ok(mut guard) => *guard = fullscreen,
            Err(poisoned) => *poisoned.into_inner() = fullscreen,
        }
    }
}


// Command implementations live in `commands/` (sidecar / window / shell).
pub use commands::*;
#[cfg(all(test, target_os = "macos"))]
pub(crate) use commands::macos_reveal_open_args;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state = Arc::new(Mutex::new(SidecarState {
        child: None,
        starting: false,
        port: None,
        session: 0,
    }));

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths = collect_paths_from_args(args);
            if paths.is_empty() {
                show_main_window(app);
            } else {
                dispatch_cli_open_files(app, paths);
            }
        }));
    }

    builder
        .manage(sidecar_state.clone())
        .manage(PendingOpenFiles::default())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .on_window_event(|window, event| {
            // macOS: red traffic-light / ⌘W may hide instead of quitting.
            // Only the Lab shell (`main`) hides — child windows (e.g. train-monitor)
            // close/destroy normally so they can leave the desktop independently.
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && hide_on_close_enabled() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open_files,
            sidecar_start,
            sidecar_stop,
            sidecar_is_running,
            sidecar_get_port,
            sidecar_engine_start,
            sidecar_http_exchange,
            window_close_policy,
            window_set_fullscreen,
            window_is_fullscreen,
            ui_get_scale,
            ui_set_scale,
            shell_reveal_in_finder,
            shell_open_url,
            shell_ensure_dir,
            shell_write_text_file,
            shell_ensure_file,
            shell_clear_orcai_spec_cache,
            shell_reset_orcai_desktop_db,
            shell_wipe_orcai_desktop_dir,
            shell_delete_preferences_store,
            shell_truncate_sidecar_log,
        ])
        .setup(move |app| {
            apply_shell_prefs_from_store(app.handle());
            if read_launch_fullscreen() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_fullscreen(true);
                }
            }
            sidecar::cleanup_stale_sidecars_on_launch(app.handle());
            let paths = collect_paths_from_args(std::env::args());
            if !paths.is_empty() {
                queue_opened_files(app.handle(), paths);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building orcAI Desktop")
        .run(move |app, event| {
            match event {
                RunEvent::Exit => {
                    if let Some(state) = app.try_state::<Arc<Mutex<SidecarState>>>() {
                        let _ = sidecar::stop_sidecar_process(state.inner());
                    }
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    show_main_window(app);
                }
                #[cfg(any(target_os = "macos", target_os = "ios"))]
                RunEvent::Opened { urls } => {
                    let paths: Vec<PathBuf> = urls
                        .into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .collect();
                    emit_opened_files(app, paths);
                }
                _ => {}
            }
        });
}

#[cfg(all(test, target_os = "macos"))]
mod macos_reveal_tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::macos_reveal_open_args;

    fn scratch(name: &str) -> PathBuf {
        let tick = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("orcai-reveal-{name}-{tick}"));
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn directory_opens_itself_without_reveal_flag() {
        let dir = scratch("folder with spaces");
        let args = macos_reveal_open_args(&dir);
        assert_eq!(args.len(), 1);
        assert_eq!(args[0], dir.as_os_str());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_is_revealed_in_its_parent() {
        let dir = scratch("files");
        let file = dir.join("note.txt");
        fs::write(&file, b"x").expect("file");
        let args = macos_reveal_open_args(&file);
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "-R");
        assert_eq!(args[1], file.as_os_str());
        let _ = fs::remove_dir_all(&dir);
    }
}
