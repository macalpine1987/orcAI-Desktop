#!/usr/bin/env bash
# Start tauri dev with auto-resolved bundled Python (cache/symlink; no manual venv repair).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

bash "${ROOT}/scripts/ensure-bundled-python.sh"

if [[ -f "/tmp/orcai-desktop-bundled-python.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "/tmp/orcai-desktop-bundled-python.env"
  set +a
fi

exec npx tauri dev "$@"
