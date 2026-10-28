use std::fs::File;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

use super::SidecarState;

/// Dev / manual sidecar default when not started by the desktop host.
pub const SIDECAR_DEFAULT_PORT: u16 = 8741;

#[derive(Clone)]
struct SidecarStartExtras {
    spec_cache_dir: Option<String>,
    job_logs_dir: Option<String>,
}

impl SidecarStartExtras {
    const fn empty() -> Self {
        Self {
            spec_cache_dir: None,
            job_logs_dir: None,
        }
    }
}

static START_EXTRAS: Mutex<SidecarStartExtras> = Mutex::new(SidecarStartExtras::empty());

pub fn set_start_extras(spec_cache_dir: Option<String>, job_logs_dir: Option<String>) {
    if let Ok(mut guard) = START_EXTRAS.lock() {
        guard.spec_cache_dir = spec_cache_dir.filter(|s| !s.trim().is_empty());
        guard.job_logs_dir = job_logs_dir.filter(|s| !s.trim().is_empty());
    }
}

fn start_extras() -> SidecarStartExtras {
    START_EXTRAS
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| SidecarStartExtras::empty())
}

struct LaunchSpec {
    python: PathBuf,
    workdir: PathBuf,
    resource_dir: Option<PathBuf>,
    pythonpath: Option<PathBuf>,
    venv_root: Option<PathBuf>,
    log_file: Option<PathBuf>,
}

pub fn pick_ephemeral_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    drop(listener);
    Some(port)
}

pub fn is_port_listening(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    TcpStream::connect_timeout(
        &addr.parse().expect("valid addr"),
        Duration::from_millis(400),
    )
    .is_ok()
}

fn port_listening_with_retries(port: u16, attempts: u32, delay: Duration) -> bool {
    for i in 0..attempts {
        if is_port_listening(port) {
            return true;
        }
        if i + 1 < attempts {
            std::thread::sleep(delay);
        }
    }
    false
}

/// Notify UI if the sidecar process exits unexpectedly (OOM, crash, kill).
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

/// Mark queued and running jobs cancelled, and stop their workers, before SIGKILL.
/// ``Child::kill`` does not run the sidecar shutdown hook.
fn try_cancel_active_jobs_http(port: u16) {
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

fn try_stop_engine_http(port: u16) {
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

/// Our sidecar answers /health with ``"status":"ok"`` and an ``orcai`` field.
fn is_orcai_sidecar(port: u16) -> bool {
    http_get(&format!("http://127.0.0.1:{port}/health"), 2)
        .map(|text| text.contains(r#""status":"ok""#) && text.contains(r#""orcai":"#))
        .unwrap_or(false)
}

/// Free orphaned sidecar listeners from dev runs or crashed sessions.
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
                    if port_listening_with_retries(port, 48, Duration::from_millis(250)) {
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
fn free_sidecar_port(port: u16) {
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

pub fn wait_for_sidecar_port(app: &AppHandle, port: u16, is_current: impl Fn() -> bool) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let started = Instant::now();
    let deadline = started + Duration::from_secs(90);
    emit_sidecar_boot_progress(app, "waiting_port", 0.12);
    while Instant::now() < deadline {
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

fn resolve_launch_spec(app: &AppHandle) -> Option<LaunchSpec> {
    // Production and default dev: only the bundled venv inside app resources (fully autonomous).
    if let Some(spec) = resolve_bundled_spec(app) {
        return Some(spec);
    }

    // Optional editable sidecar for contributors (ORCAI_USE_DEV_PYTHON=1 npm run dev).
    if cfg!(debug_assertions) && dev_python_override_enabled() {
        if let Some(spec) = resolve_dev_spec(app) {
            eprintln!("orcAI Desktop: ORCAI_USE_DEV_PYTHON=1 — using apps/sidecar/.venv");
            return Some(spec);
        }
    }

    eprintln!(
        "orcAI Desktop: bundled Python not found in app resources — run: bash scripts/bundle-python.sh"
    );
    None
}

fn dev_python_override_enabled() -> bool {
    std::env::var("ORCAI_USE_DEV_PYTHON")
        .ok()
        .is_some_and(|v| matches!(v.as_str(), "1" | "true" | "yes"))
}

fn dev_resources_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
}

fn resolve_bundled_spec(app: &AppHandle) -> Option<LaunchSpec> {
    if let Some(bundle_root) = env_bundled_python_root() {
        let python = resolve_python_in_bundle_root(&bundle_root)?;
        let venv_root = bundle_root.join("venv");
        eprintln!(
            "orcAI Desktop: ORCAI_BUNDLED_PYTHON_DIR — using {}",
            bundle_root.display()
        );
        return Some(LaunchSpec {
            python,
            workdir: bundle_root.clone(),
            resource_dir: Some(bundle_root),
            pythonpath: None,
            venv_root: Some(venv_root),
            log_file: sidecar_log_path(app),
        });
    }

    let resource_dir = bundled_resource_root(app)?;
    let python = resolve_python_in_resource_root(&resource_dir)?;
    let venv_root = python.parent().and_then(|bin| bin.parent()).map(Path::to_path_buf);

    Some(LaunchSpec {
        python,
        workdir: resource_dir.clone(),
        resource_dir: Some(resource_dir),
        pythonpath: None,
        venv_root,
        log_file: sidecar_log_path(app),
    })
}

/// Cache / external bundle root from `ensure-bundled-python.sh` (contains `venv/` directly).
fn env_bundled_python_root() -> Option<PathBuf> {
    let root = std::env::var("ORCAI_BUNDLED_PYTHON_DIR").ok()?;
    let path = PathBuf::from(root);
    if path.join("venv/bin").is_dir() {
        Some(path)
    } else {
        None
    }
}

fn resolve_python_in_bundle_root(bundle_root: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    let candidates = [
        "venv/Scripts/python.exe",
        "venv/bin/python3",
        "venv/bin/python",
    ];
    #[cfg(not(windows))]
    let candidates = ["venv/bin/python3.11", "venv/bin/python3", "venv/bin/python"];

    for rel in candidates {
        let path = bundle_root.join(rel);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Tauri resource dir in release; `src-tauri/resources` when running `tauri dev`.
fn bundled_resource_root(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        if dir.join("python/venv/bin").is_dir() || resolve_resource_python(app).is_some() {
            return Some(dir);
        }
    }
    let dev = dev_resources_dir();
    if dev.join("python/venv/bin").is_dir() {
        return Some(dev);
    }
    None
}

fn resolve_python_in_resource_root(resource_dir: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    let candidates = [
        "python/venv/Scripts/python.exe",
        "python/venv/bin/python3",
        "python/venv/bin/python",
    ];
    #[cfg(not(windows))]
    let candidates = [
        "python/venv/bin/python3.11",
        "python/venv/bin/python3",
        "python/venv/bin/python",
    ];

    for rel in candidates {
        let path = resource_dir.join(rel);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn resolve_resource_python(app: &AppHandle) -> Option<PathBuf> {
    let candidates = [
        "python/venv/bin/python3.11",
        "python/venv/bin/python3",
        "python/venv/bin/python",
        #[cfg(windows)]
        "python/venv/Scripts/python.exe",
    ];

    for rel in candidates {
        if let Ok(path) = app.path().resolve(rel, BaseDirectory::Resource) {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

/// Ensure the interpreter can import the sidecar before spawn (avoids silent instant exit).
fn verify_sidecar_python(spec: &LaunchSpec) -> Result<(), String> {
    let mut cmd = Command::new(&spec.python);
    cmd.args(["-c", "import orcai_desktop_sidecar.main"]);
    cmd.current_dir(&spec.workdir)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    if let Some(ref resource_dir) = spec.resource_dir {
        cmd.env("ORCAI_DESKTOP_RESOURCE_DIR", resource_dir);
    }
    if let Some(ref venv) = spec.venv_root {
        cmd.env("VIRTUAL_ENV", venv);
    }
    if let Some(ref pythonpath) = spec.pythonpath {
        cmd.env("PYTHONPATH", pythonpath);
    }

    let output = cmd.output().map_err(|e| {
        format!(
            "Could not run {} ({e}). For dev: cd apps/sidecar && python3.11 -m venv .venv && pip install -e '.[analytics]'. For release: bash scripts/bundle-python.sh",
            spec.python.to_string_lossy()
        )
    })?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr.trim();
    let mut msg = format!(
        "Sidecar Python at {} is missing orcAI packages.",
        spec.python.to_string_lossy()
    );
    if !detail.is_empty() {
        msg.push_str("\n");
        msg.push_str(detail);
    }
    msg.push_str("\n\nFix: run `bash scripts/bundle-python.sh` from the repo root (bundled into the .app). For editable dev only: ORCAI_USE_DEV_PYTHON=1 with apps/sidecar/.venv.");
    Err(msg)
}

fn resolve_dev_spec(app: &AppHandle) -> Option<LaunchSpec> {
    let workdir = dev_sidecar_workdir();
    let pythonpath = workdir.join("src");

    let python_names = vec![
        workdir.join(".venv/bin/python3"),
        workdir.join(".venv/bin/python"),
    ];
    #[cfg(windows)]
    python_names.push(workdir.join(".venv/Scripts/python.exe"));

    for path in python_names {
        if path.is_file() {
            let venv_root = path
                .parent()
                .and_then(|p| p.parent())
                .map(Path::to_path_buf);
            let dev_resources = dev_resources_dir();
            return Some(LaunchSpec {
                python: path,
                workdir: workdir.clone(),
                resource_dir: Some(dev_resources),
                pythonpath: Some(pythonpath),
                venv_root,
                log_file: sidecar_log_path(app),
            });
        }
    }

    eprintln!(
        "orcAI Desktop: apps/sidecar/.venv not found — create it or use bundled Python (default)"
    );
    None
}

fn dev_sidecar_workdir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../apps/sidecar")
}

fn sidecar_log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_log_dir()
        .ok()
        .map(|dir| dir.join("sidecar.log"))
}

/// Pip console scripts keep a build-machine shebang; rewrite to this interpreter (relocatable .app).
fn patch_venv_console_scripts(venv_root: &Path, python: &Path) {
    let bin_dirs = [
        venv_root.join("bin"),
        #[cfg(windows)]
        venv_root.join("Scripts"),
    ];

    let shebang = format!("#!{}\n", python.display());

    for bin_dir in bin_dirs {
        let Ok(entries) = std::fs::read_dir(&bin_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path == python {
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }
            let Ok(content) = std::fs::read(&path) else {
                continue;
            };
            if !content.starts_with(b"#!") {
                continue;
            }
            let Some(newline_pos) = content.iter().position(|&b| b == b'\n') else {
                continue;
            };
            let mut next = shebang.as_bytes().to_vec();
            next.extend_from_slice(&content[newline_pos..]);
            if std::fs::write(&path, &next).is_ok() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = meta.permissions();
                    if meta.permissions().mode() & 0o111 != 0 {
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
            }
        }
    }
}

fn spawn_with_spec(spec: &LaunchSpec, port: u16) -> Result<Child, String> {
    if let Some(ref venv_root) = spec.venv_root {
        patch_venv_console_scripts(venv_root, &spec.python);
    }

    if let Err(reason) = verify_sidecar_python(spec) {
        eprintln!("orcAI Desktop: {reason}");
        return Err(reason);
    }

    // Always launch via the resolved interpreter — never pip console-script wrappers
    // (their shebangs point at the build machine path and break after moving the .app).
    let program = spec.python.clone();
    let args = ["-m", "orcai_desktop_sidecar.main"];
    let mut cmd = Command::new(&program);
    cmd.args(args)
        .current_dir(&spec.workdir)
        .env("PYTHONUNBUFFERED", "1")
        .env("ORCAI_DESKTOP_PORT", port.to_string());

    let extras = start_extras();
    if let Some(ref cache) = extras.spec_cache_dir {
        cmd.env("ORCAI_SPEC_CACHE_ROOT", cache);
    }

    if let Some(ref resource_dir) = spec.resource_dir {
        cmd.env("ORCAI_DESKTOP_RESOURCE_DIR", resource_dir);
    }
    // Do not set PYTHONHOME — it breaks venv copies linked to Homebrew on macOS
    // (encodings module missing). VIRTUAL_ENV is enough for discovery.
    if let Some(ref venv) = spec.venv_root {
        cmd.env("VIRTUAL_ENV", venv);
    }
    if let Some(ref pythonpath) = spec.pythonpath {
        cmd.env("PYTHONPATH", pythonpath);
    }

    cmd.stdout(Stdio::null());
    let log_path = extras
        .job_logs_dir
        .as_ref()
        .map(|dir| PathBuf::from(dir).join("sidecar.log"))
        .or_else(|| spec.log_file.clone());
    if let Some(log_path) = log_path {
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match File::options().create(true).append(true).open(log_path) {
            Ok(mut file) => {
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = writeln!(file, "\n--- sidecar start {ts} port={port} ---");
                cmd.stderr(Stdio::from(file));
            }
            Err(err) => {
                eprintln!("orcAI Desktop: could not open sidecar log: {err}");
                cmd.stderr(Stdio::null());
            }
        }
    } else {
        cmd.stderr(Stdio::null());
    }

    match cmd.spawn() {
        Ok(process) => {
            eprintln!(
                "orcAI Desktop: started sidecar ({}) on port {port}",
                spec.python.to_string_lossy()
            );
            Ok(process)
        }
        Err(err) => {
            let msg = format!(
                "Could not start sidecar process ({}): {err}",
                spec.python.to_string_lossy()
            );
            eprintln!("orcAI Desktop: {msg}");
            Err(msg)
        }
    }
}
