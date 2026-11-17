//! Resolve bundled/dev Python and spawn the sidecar process.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub(crate) struct SidecarStartExtras {
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

pub(crate) fn start_extras() -> SidecarStartExtras {
    START_EXTRAS
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| SidecarStartExtras::empty())
}

pub(crate) struct LaunchSpec {
    python: PathBuf,
    workdir: PathBuf,
    resource_dir: Option<PathBuf>,
    pythonpath: Option<PathBuf>,
    venv_root: Option<PathBuf>,
    log_file: Option<PathBuf>,
}


pub(crate) fn resolve_launch_spec(app: &AppHandle) -> Option<LaunchSpec> {
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
            "Could not run {} ({e}). For dev: cd apps/sidecar && python3.11 -m venv .venv && pip install -e '.'. For release: bash scripts/bundle-python.sh",
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

pub(crate) fn sidecar_log_path(app: &AppHandle) -> Option<PathBuf> {
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

pub(crate) fn spawn_with_spec(spec: &LaunchSpec, port: u16) -> Result<Child, String> {
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
