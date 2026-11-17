//! Tauri commands: open URL, reveal, ensure paths, factory wipe helpers.

use std::path::{Path, PathBuf};

use tauri::Manager;

#[tauri::command]
pub fn shell_open_url(url: String) -> Result<(), String> {
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

/// Arguments for macOS `open`. A directory opens itself. A file is selected in its folder (`-R`).
/// One argument per path, so spaces stay inside that argument and are not passed through a shell.
#[cfg(target_os = "macos")]
pub(crate) fn macos_reveal_open_args(path: &Path) -> Vec<std::ffi::OsString> {
    if path.is_dir() {
        vec![path.as_os_str().to_os_string()]
    } else {
        vec![std::ffi::OsString::from("-R"), path.as_os_str().to_os_string()]
    }
}

/// Reveal a file in Finder (macOS), Explorer (Windows), or the parent folder (Linux).
#[tauri::command]
pub fn shell_reveal_in_finder(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("path not found: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(macos_reveal_open_args(&path))
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
pub fn shell_ensure_dir(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("empty path".into());
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

pub fn orcai_user_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map(|home| home.join(".orcai-desktop"))
        .map_err(|e| e.to_string())
}

/// Delete `~/.orcai-desktop/spec-cache` (tile cache). Safe when sidecar is stopped.
#[tauri::command]
pub fn shell_clear_orcai_spec_cache(app: tauri::AppHandle) -> Result<(), String> {
    let root = orcai_user_data_dir(&app)?.join("spec-cache");
    remove_path_if_exists(&root)
}

/// Delete Desktop SQLite (`app.db` + WAL). Call only after sidecar is stopped.
#[tauri::command]
pub fn shell_reset_orcai_desktop_db(app: tauri::AppHandle) -> Result<(), String> {
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
pub fn shell_wipe_orcai_desktop_dir(app: tauri::AppHandle) -> Result<(), String> {
    remove_path_if_exists(&orcai_user_data_dir(&app)?)
}

/// Delete `preferences.json` (Tauri Store). In-memory defaults apply until the user saves.
#[tauri::command]
pub fn shell_delete_preferences_store(app: tauri::AppHandle) -> Result<(), String> {
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
pub fn shell_truncate_sidecar_log(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    remove_path_if_exists(&dir.join("sidecar.log"))
}

pub fn remove_path_if_exists(path: &Path) -> Result<(), String> {
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
pub fn shell_write_text_file(path: String, contents: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(dest, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_ensure_file(path: String) -> Result<(), String> {
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
