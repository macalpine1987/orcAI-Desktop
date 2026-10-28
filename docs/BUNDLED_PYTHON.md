# Bundled Python (autonomous app)

orcAI Desktop ships a **complete Python 3.11 runtime** inside the app bundle. End users do **not** install Python, orcAI, or TensorFlow separately.

## Layout

| Path (macOS `.app`) | Purpose |
|---------------------|---------|
| `Contents/Resources/python/venv/` | Python interpreter + orcAI + TensorFlow + sidecar |

Rust (`src-tauri/src/sidecar.rs`) starts only this interpreter. System `python3` on PATH is **not** used in release builds or default `tauri dev`.

## One-time setup (developers)

On the **same OS and CPU** as your users (e.g. macOS arm64):

```bash
cd orcai-desktop
npm run prepare:sidecar   # bundle-python.sh (~several GB)
```

Or:

```bash
bash scripts/bundle-python.sh
```

`npm run dev` / `npm run build` expect a working bundled Python (`scripts/ensure-bundled-python.sh`).

The bundle is stored in a **cache directory** (default `~/.cache/orcai-desktop/python-bundle-<platform>`). Dev mode uses `ORCAI_BUNDLED_PYTHON_DIR` so a broken in-repo `src-tauri/resources/python/venv` does not block startup. Before release builds, `materialize-bundled-python.sh` copies the cache into `resources/python/` for Tauri bundling.

```bash
cd orcai-desktop
npm run dev          # auto-resolves cache / link / rebuild
npm run check:sidecar
npm run prepare:sidecar   # full rebuild into cache (~several GB)
```

Override cache location:

```bash
ORCAI_PYTHON_CACHE_DIR=/tmp/my-orcai-bundle npm run prepare:sidecar
ORCAI_BUNDLED_PYTHON_DIR=/path/to/bundle npm run dev
```

Runtime env file (written by ensure script): `/tmp/orcai-desktop-bundled-python.env`

### Optional: editable sidecar

```bash
cd apps/sidecar && python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[analytics]"
ORCAI_USE_DEV_PYTHON=1 npm run dev
```

## Release build

```bash
npm run build
# or
bash scripts/build-macos-release.sh
```

`prepare-production.sh` runs before Tauri bundles resources. The macOS release script **must** pass `scripts/verify-app-python.sh` (`AUTONOMY GATE PASSED`) on the stamped `.app` or the build fails.

Manual check:

```bash
npm run verify:autonomy
# or
bash scripts/verify-app-python.sh /tmp/orcAI-Desktop_0.1.10_aarch64.app
```

## Portability

`bundle-python.sh` creates the venv with `python3.11 -m venv --copies`, then `make-python-venv-portable.sh` replaces any symlinks that still point outside the venv (e.g. Homebrew).

After `tauri build`, `embed-python-in-built-app.sh`:

1. Embeds `Python.framework` next to `venv/` and relinks **all** framework Mach-O that load `Python` (including Homebrew’s nested `Resources/Python.app/Contents/MacOS/Python` — the real interpreter the `venv/bin/python3.11` stub `posix_spawn`s) to `@loader_path/…`
2. Runs `vendor-python-dylibs.sh` — copies Homebrew OpenSSL / sqlite / xz / mpdecimal into the framework `lib/` and rewrites stdlib extensions to `@loader_path/../…`

`verify-app-python.sh` fails the build if any Mach-O under `python/` (venv + framework, **including Python.app**) still references `/opt/homebrew` or `/usr/local/Cellar`, and smoke-tests `import ssl` with a cleaned `PATH`.

**Known pitfall:** checking only `venv/bin/python3.11` is not enough — on the build Mac that stub still finds Homebrew via the nested Python.app absolute Cellar path, so the gate must scan Python.app explicitly.

**Known pitfall (paths):** `embed-python-framework.sh` must compute `@loader_path/…` from *physical* paths (`pwd -P`, `realpath`). Under `/tmp` (→ `/private/tmp`) a mix of logical and physical paths makes `os.path.relpath` climb to `/` and emit `@loader_path/../../…/private/tmp/…`, which dyld cannot resolve after relocation; the import smoke test then aborts with `Library not loaded`.

For redistribution, prefer **python.org 3.11** over Homebrew when running `bundle-python.sh` (fewer external dylib references). Homebrew is OK if embed + vendor steps complete successfully.

## Runtime

| Variable | Effect |
|----------|--------|
| `ORCAI_SKIP_SIDECAR=1` | Do not auto-start sidecar |
| `ORCAI_USE_DEV_PYTHON=1` | Dev only: use `apps/sidecar/.venv` instead of bundled venv |
| `ORCAI_DESKTOP_PORT` | Sidecar port (set by host) |
| `ORCAI_BUNDLED_PYTHON_DIR` | Dev/CI: bundle root with `venv/` (set by `ensure-bundled-python.sh`) |
| `ORCAI_PYTHON_CACHE_DIR` | Where `bundle-python.sh` writes the venv (default: `~/.cache/orcai-desktop/...`) |

Sidecar log: `~/Library/Logs/ch.ethz.orcai.desktop/sidecar.log` (macOS).

## Troubleshooting

1. `npm run check:sidecar` — quick validation of bundled venv.
2. `bash scripts/ensure-sidecar-python.sh` — rebuild if missing.
3. After `.app` build: `bash scripts/verify-app-python.sh "/path/to/orcAI Desktop.app"`.
