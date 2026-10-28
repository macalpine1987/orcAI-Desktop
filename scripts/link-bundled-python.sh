#!/usr/bin/env bash
# Point src-tauri/resources/python at a valid bundle root (symlink preferred).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/resolve-bundled-python.sh
source "${ROOT}/scripts/resolve-bundled-python.sh"

SRC="${1:-}"
if [[ -z "${SRC}" ]]; then
  SRC="$(find_bundled_python_root)" || {
    echo "link-bundled-python: no valid bundle root found" >&2
    exit 1
  }
fi

if [[ -L "${SRC}" ]]; then
  SRC="$(cd "${SRC}" && pwd -P)"
fi

verify_bundled_python_at "${SRC}" || {
  echo "link-bundled-python: bundle is incomplete at ${SRC}" >&2
  exit 1
}

TARGET="${ROOT}/src-tauri/resources/python"
mkdir -p "${ROOT}/src-tauri/resources"

if [[ -L "${TARGET}" ]]; then
  local_target="$(readlink "${TARGET}" 2>/dev/null || true)"
  if [[ "${local_target}" == "${SRC}" ]] || [[ "$(cd "${TARGET}" 2>/dev/null && pwd -P)" == "${SRC}" ]]; then
    echo "link-bundled-python: already linked to ${SRC}"
    exit 0
  fi
  rm -f "${TARGET}"
elif [[ -d "${TARGET}" ]]; then
  chmod -R u+w "${TARGET}" 2>/dev/null || true
  chflags -R nouchg "${TARGET}" 2>/dev/null || true
  orphan="${TARGET}.orphan.$(date +%s)"
  if mv "${TARGET}" "${orphan}" 2>/dev/null; then
    echo "link-bundled-python: moved stale bundle to ${orphan}" >&2
  else
    echo "link-bundled-python: could not move ${TARGET}; will try symlink anyway" >&2
    rm -rf "${TARGET}" 2>/dev/null || true
  fi
fi

ln -sfn "${SRC}" "${TARGET}"
echo "link-bundled-python: ${TARGET} -> ${SRC}"
