#!/usr/bin/env bash
# Rebuild bundled Python if the venv is missing or cannot import the sidecar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

bash "${ROOT}/scripts/ensure-bundled-python.sh"
# shellcheck source=scripts/resolve-bundled-python.sh
source "${ROOT}/scripts/resolve-bundled-python.sh"
root="$(find_bundled_python_root)"
VENV_PY="${root}/venv/bin/python3"
echo "Sidecar Python OK: ${VENV_PY}"
"${VENV_PY}" -c "from orcai_desktop_sidecar.adapters.models import verify_builtin_models_bundle; print('Models:', len(verify_builtin_models_bundle()))"
echo "Done. Restart orcAI Desktop and start the sidecar again."
