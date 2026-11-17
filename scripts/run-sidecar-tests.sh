#!/usr/bin/env bash
# Run sidecar unit tests with the bundled Python (has orcAI / librosa / TF).
# Do not set NUMBA_DISABLE_JIT=1 — it breaks librosa guvectorize imports (numba≥0.61).
# Point NUMBA_CACHE_DIR at a writable tree: Cursor agent sandbox (and some CI)
# cannot create caches next to site-packages under ~/.cache/orcai-desktop/…
# and librosa then fails with “no locator available”.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/apps/sidecar"

PY=""
if [[ -x "${ROOT}/src-tauri/resources/python/venv/bin/python3.11" ]]; then
  PY="${ROOT}/src-tauri/resources/python/venv/bin/python3.11"
elif [[ -x "${ROOT}/apps/sidecar/.venv/bin/python3" ]]; then
  PY="${ROOT}/apps/sidecar/.venv/bin/python3"
else
  PY="$(command -v python3.11 || command -v python3)"
fi

export PYTHONPATH=src
export ORCAI_FORCE_INPROCESS_JOBS="${ORCAI_FORCE_INPROCESS_JOBS:-1}"
if [[ -z "${NUMBA_CACHE_DIR:-}" ]]; then
  export NUMBA_CACHE_DIR="${TMPDIR:-/tmp}/orcai-desktop-numba-cache"
fi
mkdir -p "${NUMBA_CACHE_DIR}"
exec "${PY}" -m unittest discover -s tests -v "$@"
