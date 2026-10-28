# orcAI Desktop Sidecar

Local FastAPI service that runs orcAI commands for the UI.

## Requirements

- **Python 3.11** (required by orcAI)
- Several GB disk for TensorFlow and dependencies
- macOS Apple Silicon or Linux recommended; Windows supported with CPU inference

## Install

```bash
cd apps/sidecar
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[analytics]"   # DuckDB for test metrics
```

First install may take several minutes (TensorFlow, orcAI from GitHub).

## Run

```bash
python -m orcai_desktop_sidecar
# or: orcai-desktop-sidecar
```

API: http://127.0.0.1:8741

## Implemented commands

| Command | Status |
|---------|--------|
| `predict` | ✓ |
| `filter-predictions` | ✓ |
| `init` | ✓ |
| `create-recording-table` | ✓ |
| `create-spectrograms` … `test` | ✓ |
| Viewer tiles | `GET /v1/spectrogram/tile`, `/waveform` |

## API

- `GET /v1/capabilities` — orcai version, implemented commands, `builtin_models` (bundled weights)
- `GET /v1/models` — built-in + project-trained models (no engine warmup required)
- `POST /v1/jobs` — `{ "command": "predict", "params": { ... } }`
- `POST /v1/jobs/predict` — typed predict body
- `POST /v1/jobs/init` — initialize project
- `POST /v1/jobs/create-recording-table` — scan folder → CSV
- `GET /v1/recording-tables/preview?path=` — CSV preview for UI
- `GET /v1/spectrogram/meta?path=` — WAV duration / sample rate
- `GET /v1/spectrogram/tile?path=&t0=&t1=&width=&height=` — PNG tile (exact orcAI `make_spectrogram`, float32 disk cache)
- `GET /v1/spectrogram/waveform?path=&t0=&t1=` — PNG waveform strip
- `POST /v1/jobs/{id}/cancel` — cancel job (cooperative + terminate worker subprocess)
- `GET /v1/results/test-metrics` — scan CSV/JSON/DuckDB metrics under project/model dirs
- `POST /v1/labels/export-audacity` — Audacity label file (tab-separated seconds)

## Example

```bash
curl -X POST http://127.0.0.1:8741/v1/jobs/predict \
  -H 'Content-Type: application/json' \
  -d '{"recording_path":"/path/to/file.wav","model":"orcai-isl-v1"}'
```
