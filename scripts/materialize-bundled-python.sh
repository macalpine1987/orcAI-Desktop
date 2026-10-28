#!/usr/bin/env bash
# Copy a valid bundle from cache into src-tauri/resources/python for release builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/resolve-bundled-python.sh
source "${ROOT}/scripts/resolve-bundled-python.sh"

SRC="${1:-}"
if [[ -z "${SRC}" ]]; then
  SRC="$(find_bundled_python_root)" || {
    echo "materialize-bundled-python: no valid bundle root" >&2
    exit 1
  }
fi

if [[ -L "${SRC}" ]]; then
  SRC="$(cd "${SRC}" && pwd -P)"
fi

verify_bundled_python_at "${SRC}" || {
  echo "materialize-bundled-python: incomplete bundle at ${SRC}" >&2
  exit 1
}

TARGET="${ROOT}/src-tauri/resources/python"
STAGING="${TARGET}.staging.$$"

cleanup() {
  rm -rf "${STAGING}"
}
trap cleanup EXIT

mkdir -p "${ROOT}/src-tauri/resources"
rm -rf "${STAGING}"
rsync -a --exclude 'Python.framework' "${SRC}/" "${STAGING}/"

if [[ -L "${TARGET}" ]]; then
  rm -f "${TARGET}"
elif [[ -d "${TARGET}" ]]; then
  chmod -R u+w "${TARGET}" 2>/dev/null || true
  chflags -R nouchg "${TARGET}" 2>/dev/null || true
  orphan="${TARGET}.orphan.$(date +%s)"
  mv "${TARGET}" "${orphan}" 2>/dev/null || rm -rf "${TARGET}"
fi

mv "${STAGING}" "${TARGET}"
trap - EXIT
# Venv was already made portable in the cache; framework is embedded into .app post-build only.
for alias in python3 python; do
  rm -f "${TARGET}/venv/bin/${alias}"
  ln -sf python3.11 "${TARGET}/venv/bin/${alias}"
done
echo "materialize-bundled-python: copied ${SRC} -> ${TARGET}"
