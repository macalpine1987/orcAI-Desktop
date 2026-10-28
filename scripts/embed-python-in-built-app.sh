#!/usr/bin/env bash
# Embed portable Python.framework into a freshly built macOS .app bundle.
# Required after every `tauri build --bundles app` — the venv is copied without the framework.
#
# Order (do not reorder):
#   1. embed framework + relink
#   2. vendor-python-dylibs (+ normalize @loader_path/../ → ../../)
#   3. sync sidecar site-packages
#   4. portable pyvenv.cfg + bash stubs (LAST — never leave Mach-O pyvenv launcher)
#   5. ad-hoc codesign Mach-O we touched
#   6. verify-app-python.sh (AUTONOMY GATE)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-${ROOT}/src-tauri/target/release/bundle/macos/orcAI Desktop.app}"

if [[ ! -d "${APP}" ]]; then
  echo "embed-python-in-built-app: .app not found: ${APP}" >&2
  exit 1
fi

PY_VENV="${APP}/Contents/Resources/python/venv"
if [[ ! -d "${PY_VENV}/bin" ]]; then
  echo "embed-python-in-built-app: bundled venv missing: ${PY_VENV}" >&2
  exit 1
fi

bash "${ROOT}/scripts/embed-python-framework.sh" "${PY_VENV}"

# Vendor Homebrew OpenSSL / xz / sqlite / mpdecimal into the bundle and rewrite @rpath.
bash "${ROOT}/scripts/vendor-python-dylibs.sh" "${APP}/Contents/Resources/python"

bash "${ROOT}/scripts/sync-sidecar-into-app.sh" "${APP}"

# Mach-O pyvenv launcher resolves home vs cwd — breaks in .app. Re-install stubs LAST.
bash "${ROOT}/scripts/embed-python-framework.sh" "${PY_VENV}" --wrappers-only

if command -v codesign >/dev/null 2>&1; then
  FW="${APP}/Contents/Resources/python/Python.framework/Versions/3.11/Python"
  NESTED="${APP}/Contents/Resources/python/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
  DYN="${APP}/Contents/Resources/python/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"
  codesign --force --sign - "${FW}" 2>/dev/null || true
  if [[ -f "${NESTED}" ]]; then
    codesign --force --sign - "${NESTED}" 2>/dev/null || true
  fi
  find "${APP}/Contents/Resources/python/dylibs" -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  find "${APP}/Contents/Resources/python/Python.framework/Versions/3.11/lib" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  if [[ -d "${DYN}" ]]; then
    find "${DYN}" -type f -name "*.so" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  # Deep-sign the .app so nested Mach-O matches the bundle seal (ad-hoc).
  codesign --force --deep --sign - "${APP}" 2>/dev/null || true
fi

bash "${ROOT}/scripts/verify-app-python.sh" "${APP}"
