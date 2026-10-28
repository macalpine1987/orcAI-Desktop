# orcAI Desktop

Cross-platform desktop UI for [orcAI](https://github.com/ethz-tb/orcAI).

## Design

- Monochrome (black & white)
- **Simple / Expert** UI modes
- **Standard / Lab** layout (Expert)
- **Russian / English** — chosen at startup; English is selected by default

## Quick start (native app)

```bash
# 1. Icons (once)
bash scripts/generate-icons.sh

# 2. Dependencies
npm install && npm install --prefix apps/ui

# 3. Bundled Python (once per machine/arch, ~several GB)
npm run prepare:sidecar

# 4. Desktop — native window; sidecar uses bundled Python (no system Python required)
npm run dev
```

Use **Predict → Choose file** to select a `.wav` (or `recording_table.csv`) via the system dialog.

Release installer (bundles Python + orcAI on the build machine):

```bash
npm run build
```

## Web UI only (no Tauri)

```bash
cd apps/ui && npm install && npm run dev
```

Open http://localhost:1420

## Language

The interface language does not follow the operating system. At startup the user chooses Russian or English; English is already selected. The choice is saved and used on the next launch.

```bash
npm run ui:test
```

## Structure

```
orcai-desktop/
├── src-tauri/       # Tauri 2 (Windows, macOS; Linux later)
├── apps/ui/         # React + i18n
├── apps/sidecar/    # FastAPI (jobs API stub, orcAI next)
├── scripts/
└── docs/
```

## Sidecar API

- `GET /health` · `GET /v1/capabilities` (includes bundled `builtin_models`) · `GET /v1/models`
- `POST /v1/jobs` · `POST /v1/jobs/predict` · `GET /v1/jobs/{id}`

Implemented: **predict**, **filter-predictions**. See [apps/sidecar/README.md](apps/sidecar/README.md).

Sidecar uses a **free localhost port** per session (dev fallback **8741** via `VITE_SIDECAR_URL`).
