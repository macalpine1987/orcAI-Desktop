# Tauri shell — orcAI Desktop

## Prerequisites

- [Rust](https://rustup.rs/)
- Node.js 20+
- macOS: Xcode CLT; Windows: MSVC + WebView2

## First-time setup

```bash
cd orcai-desktop
npm install
npm install --prefix apps/ui
bash scripts/generate-icons.sh
# optional: copy a 1024×1024 PNG to assets/icon.png, then:
# npx tauri icon assets/icon.png
```

## Development

Install the sidecar once (Python **3.11**):

```bash
cd apps/sidecar
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Start the desktop app (Tauri auto-starts the sidecar on an ephemeral local port):

```bash
cd orcai-desktop
npm run prepare:sidecar   # once: bundled Python in src-tauri/resources/python/
npm run dev
```

Set `ORCAI_SKIP_SIDECAR=1` if you prefer to run the sidecar manually in another terminal.

Set `ORCAI_USE_DEV_PYTHON=1` to use `apps/sidecar/.venv` instead of the bundled venv during development.

On launch, the app starts the sidecar (**release: bundled Python only** by default), waits until the HTTP port accepts connections, and stops the process on quit. See [BUNDLED_PYTHON.md](BUNDLED_PYTHON.md).

`tauri dev` starts the Vite UI on port **1420** and opens the native window.

## File associations (Open With)

Installed builds register:

| Extension | Opens in |
|-----------|----------|
| `.wav` | Predict / spectrogram queue (+ workspace) |
| `.txt` | Spectrogram (labels; infers WAV from `*_predicted.txt`) |
| `recording_table.csv` | Recordings (preview table) |
| other `.csv` | Predict |

- **macOS**: `Open With` / double-click → `RunEvent::Opened`
- **Windows / Linux**: command-line path or `file://` URL; a second launch forwards to the running instance (`tauri-plugin-single-instance`)

Dev: pass a file path when starting the app, e.g. `npm run dev -- /path/to/recording.wav` (platform-dependent).

## File picker (Predict)

The UI uses `@tauri-apps/plugin-dialog` to choose `.wav` or `.csv` files with a **full filesystem path** for orcAI. In the browser-only dev server (`cd apps/ui && npm run dev`), use **`npm run dev` from the repo root** so Tauri is active.

## OS language

The UI uses `@tauri-apps/plugin-os` (`locale()`) when running inside Tauri. Rules:

- Russian system locale → Russian UI
- Any other locale → English UI
- Manual choice in **Settings** is stored as `localeManual: true`

## Build installers

Requires Python **3.11** on the build machine to create the bundled venv (once per platform):

```bash
npm run build
```

Runs `scripts/bundle-python.sh` then `tauri build`. The installer includes `Resources/python/venv` (macOS) with orcAI and the sidecar — no user Python install.

Artifacts under `src-tauri/target/release/bundle/`.

## Project layout

| Path | Role |
|------|------|
| `src-tauri/` | Rust / Tauri |
| `apps/ui/` | React frontend |
| `apps/sidecar/` | FastAPI + orcAI (Python) |
| `scripts/generate-icons.sh` | App icons |
