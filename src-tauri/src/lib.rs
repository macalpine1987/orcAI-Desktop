mod opened_files;
mod sidecar;

use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::{Arc, Mutex};

use opened_files::{
    collect_paths_from_args, dispatch_cli_open_files, emit_opened_files,
    queue_opened_files, show_main_window, take_pending_open_files, PendingOpenFiles,
};
use tauri::{Manager, RunEvent, State};
use tauri_plugin_store::StoreExt;

pub struct SidecarState {
    pub child: Option<Child>,
    pub starting: bool,
    pub port: Option<u16>,
    /// Bumped on every start and stop; a boot thread from an older session must not touch state.
    pub session: u64,
}

/// In-memory UI scale (DPI stub). Accepted: 1.0, 1.25.
static UI_SCALE: Mutex<f64> = Mutex::new(1.0);

const fn hide_on_close_enabled() -> bool {
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

fn scale_accepted(scale: f64) -> bool {
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

#[tauri::command(async)]
fn sidecar_start(
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
fn sidecar_stop(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<(), String> {
    sidecar::stop_sidecar_process(state.inner())
}

#[tauri::command(async)]
fn sidecar_is_running(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<bool, String> {
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
fn sidecar_get_port(state: State<'_, Arc<Mutex<SidecarState>>>) -> Result<Option<u16>, String> {
    Ok(sidecar::sidecar_listen_port(state.inner()))
}

/// Start orcAI engine via host HTTP (not WKWebView fetch) and wait until ready.
#[tauri::command(async)]
fn sidecar_engine_start(
    state: State<'_, Arc<Mutex<SidecarState>>>,
    compute_device: String,
) -> Result<(), String> {
    let port = sidecar::sidecar_listen_port(state.inner()).ok_or_else(|| {
        "Sidecar is not listening — start Sidecar first".to_string()
    })?;
    sidecar::start_engine_and_wait(port, &compute_device, 600)
}

/// Close-button policy owned by the shell (not the UI platform() check).
#[tauri::command]
fn window_close_policy() -> String {
    if hide_on_close_enabled() {
        "hide".into()
    } else {
        "stop_and_close".into()
    }
}

/// Full-screen stub.
#[tauri::command]
fn window_set_fullscreen(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_fullscreen(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn window_is_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        return window.is_fullscreen().map_err(|e| e.to_string());
    }
    Ok(false)
}

/// DPI / UI scale stub — in-memory only.
#[tauri::command]
fn ui_get_scale() -> f64 {
    match UI_SCALE.lock() {
        Ok(guard) => *guard,
        Err(poisoned) => *poisoned.into_inner(),
    }
}

#[tauri::command]
fn ui_set_scale(scale: f64) -> Result<(), String> {
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

#[tauri::command]
fn shell_open_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("only http(s) URLs are allowed".into());
    }
    let href = parsed.as_str().to_string();

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&href)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &href])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&href)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = href;
        Err("opening URLs is not supported on this platform".into())
    }
}

/// Reveal a file in Finder (macOS), Explorer (Windows), or the parent folder (Linux).
#[tauri::command]
fn shell_reveal_in_finder(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("path not found: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let parent: &Path = path.parent().ok_or_else(|| "path has no parent".to_string())?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = path;
        Err("reveal in file manager is not supported on this platform".into())
    }
}

#[tauri::command]
fn shell_ensure_dir(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("empty path".into());
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

fn orcai_user_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map(|home| home.join(".orcai-desktop"))
        .map_err(|e| e.to_string())
}

/// Delete `~/.orcai-desktop/spec-cache` (tile cache). Safe when sidecar is stopped.
#[tauri::command]
fn shell_clear_orcai_spec_cache(app: tauri::AppHandle) -> Result<(), String> {
    let root = orcai_user_data_dir(&app)?.join("spec-cache");
    remove_path_if_exists(&root)
}

/// Delete Desktop SQLite (`app.db` + WAL). Call only after sidecar is stopped.
#[tauri::command]
fn shell_reset_orcai_desktop_db(app: tauri::AppHandle) -> Result<(), String> {
    let dir = orcai_user_data_dir(&app)?;
    let db = dir.join("app.db");
    if db.is_file() {
        if let Ok(output) = std::process::Command::new("sqlite3")
            .args([db.to_string_lossy().as_ref(), "SELECT path FROM projects;"])
            .output()
        {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let project = std::path::PathBuf::from(line.trim());
                if project.as_os_str().is_empty() {
                    continue;
                }
                let root = project.join(".orcai-desktop");
                for name in ["project.db", "project.db-wal", "project.db-shm"] {
                    let _ = remove_path_if_exists(&root.join(name));
                }
            }
        }
    }
    for name in ["app.db", "app.db-wal", "app.db-shm"] {
        remove_path_if_exists(&dir.join(name))?;
    }
    Ok(())
}

/// Delete the whole `~/.orcai-desktop` tree (DB + all caches). After sidecar stop.
#[tauri::command]
fn shell_wipe_orcai_desktop_dir(app: tauri::AppHandle) -> Result<(), String> {
    remove_path_if_exists(&orcai_user_data_dir(&app)?)
}

/// Delete `preferences.json` (Tauri Store). In-memory defaults apply until the user saves.
#[tauri::command]
fn shell_delete_preferences_store(app: tauri::AppHandle) -> Result<(), String> {
    let names = ["preferences.json", "preferences.json.bak"];
    for dir in [
        app.path().app_config_dir().ok(),
        app.path().app_data_dir().ok(),
        app.path().app_local_data_dir().ok(),
    ]
    .into_iter()
    .flatten()
    {
        for name in names {
            remove_path_if_exists(&dir.join(name))?;
        }
    }
    Ok(())
}

/// Delete `sidecar.log` in the app log directory (do not recreate).
#[tauri::command]
fn shell_truncate_sidecar_log(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    remove_path_if_exists(&dir.join("sidecar.log"))
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn shell_write_text_file(path: String, contents: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(dest, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn shell_ensure_file(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("empty path".into());
    }
    let dest = PathBuf::from(&path);
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(dest, b"").map_err(|e| e.to_string())
}

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
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if hide_on_close_enabled() {
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
