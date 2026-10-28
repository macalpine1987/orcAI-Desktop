#!/usr/bin/env bash
# Steps run before `tauri build` (see src-tauri/tauri.conf.json beforeBuildCommand).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "=== orcAI Desktop: prepare production ==="
bash "${ROOT}/scripts/vendor-bit-vec.sh"
bash "${ROOT}/scripts/generate-icons.sh"

bash "${ROOT}/scripts/ensure-bundled-python.sh"
echo "Materializing bundled Python into src-tauri/resources/python for release…"
PYTHON_SRC="${ORCAI_PYTHON_SOURCE:-/tmp/orcai-desktop-python-rebuild}"
if [[ -d "${PYTHON_SRC}/venv" ]]; then
  bash "${ROOT}/scripts/materialize-bundled-python.sh" "${PYTHON_SRC}"
else
  bash "${ROOT}/scripts/materialize-bundled-python.sh"
fi
echo "Bundled Python ready ($(du -sh "${ROOT}/src-tauri/resources/python" | cut -f1))"

bash "${ROOT}/scripts/ensure-ui-deps.sh"
npm run build --prefix apps/ui
echo "=== production prepare complete ==="
