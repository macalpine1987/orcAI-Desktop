#!/usr/bin/env bash
# Fast gate for tauri dev / CI: bundled Python must exist and import the sidecar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/resolve-bundled-python.sh
source "${ROOT}/scripts/resolve-bundled-python.sh"

if root="$(find_bundled_python_root)"; then
  echo "bundled Python OK: ${root}"
  exit 0
fi

cat >&2 <<EOF
orcAI Desktop: bundled Python is missing or incomplete.

The desktop app runs a self-contained Python sidecar from:
  src-tauri/resources/python/venv/  (or ORCAI_BUNDLED_PYTHON_DIR / cache)

Auto-fix (recommended):
  cd "${ROOT}"
  bash scripts/ensure-bundled-python.sh

Or full rebuild:
  npm run prepare:sidecar

Optional: editable dev sidecar (not for release):
  ORCAI_USE_DEV_PYTHON=1 npm run dev

EOF
exit 1
