use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

pub fn collect_paths_from_args<I, S>(args: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut files = Vec::new();
    let mut first = true;

    for arg in args.into_iter() {
        if first {
            first = false;
            continue;
        }
        let s = arg.as_ref();
        if s.starts_with('-') {
            continue;
        }
        if let Some(path) = path_from_open_arg(s) {
            files.push(path);
        }
    }

    files
}

fn path_from_open_arg(s: &str) -> Option<PathBuf> {
    if let Ok(url) = url::Url::parse(s) {
        if url.scheme() == "file" {
            return url.to_file_path().ok();
        }
        return None;
    }

    let path = PathBuf::from(s);
    let known_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            ["wav", "csv", "txt"]
                .iter()
                .any(|ext| e.eq_ignore_ascii_case(ext))
        })
        .unwrap_or(false);
    if known_ext || path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn paths_to_strings(paths: Vec<PathBuf>) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|p| p.into_os_string().into_string().ok())
        .collect()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Bring the main window forward (Dock reopen, second-instance, file open).
pub fn show_main_window(app: &AppHandle) {
    focus_main_window(app);
}

/// Queue paths for the UI's first paint (`take_pending_open_files`).
pub fn queue_opened_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let strings = paths_to_strings(paths);
    if strings.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        state.0.lock().expect("pending files lock").extend(strings);
    }
}

/// Notify the running app (file opened while already running).
pub fn emit_opened_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let strings = paths_to_strings(paths);
    if strings.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        state.0.lock().expect("pending files lock").extend(strings.clone());
    }
    let _ = app.emit("open-files", strings);
    focus_main_window(app);
}

pub fn dispatch_cli_open_files(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    emit_opened_files(app, paths);
}

#[tauri::command]
pub fn take_pending_open_files(state: tauri::State<PendingOpenFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().expect("pending files lock"))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn parses_file_url() {
        let path = path_from_open_arg("file:///tmp/test.wav").expect("path");
        assert_eq!(path, Path::new("/tmp/test.wav"));
    }
}
