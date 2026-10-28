#!/usr/bin/env bash
# Ensure a working bundled Python exists for tauri dev / CI (no manual rsync).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/resolve-bundled-python.sh
source "${ROOT}/scripts/resolve-bundled-python.sh"

ENV_FILE="/tmp/orcai-desktop-bundled-python.env"
TAG="$(resolve_python_platform_tag)"

try_publish() {
  local root="${1:?}"
  export_orcai_bundled_python_env "${ENV_FILE}" "${root}"
  bash "${ROOT}/scripts/link-bundled-python.sh" "${root}" 2>/dev/null || true
}

if root="$(find_bundled_python_root "${TAG}")"; then
  try_publish "${root}"
  echo "ensure-bundled-python: using ${root}"
  exit 0
fi

echo "ensure-bundled-python: no valid bundle found — running bundle-python.sh…" >&2
bash "${ROOT}/scripts/bundle-python.sh"

if root="$(find_bundled_python_root "${TAG}")"; then
  try_publish "${root}"
  echo "ensure-bundled-python: ready at ${root}"
  exit 0
fi

cat >&2 <<EOF
orcAI Desktop: bundled Python is still missing or incomplete.

Tried:
  - src-tauri/resources/python (and symlink target)
  - ORCAI_BUNDLED_PYTHON_DIR
  - cache under ~/.cache/orcai-desktop and /tmp

Rebuild:
  cd "${ROOT}"
  npm run prepare:sidecar

Dev fallback:
  ORCAI_USE_DEV_PYTHON=1 npm run dev

EOF
exit 1
