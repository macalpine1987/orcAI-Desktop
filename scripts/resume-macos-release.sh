#!/usr/bin/env bash
# Resume macOS release after prepare-production (Python + UI already in BUILD_ROOT).
set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/tmp/orcai-desktop-build}"
export PATH="${HOME}/.cargo/bin:/opt/homebrew/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-/tmp/cargo-home}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${BUILD_ROOT}/src-tauri/target}"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy 2>/dev/null || true

cd "${BUILD_ROOT}"
VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"

echo "=== Tauri build (.app) v${VERSION} ==="
npm run tauri build -- --bundles app

APP="${CARGO_TARGET_DIR}/release/bundle/macos/orcAI Desktop.app"
if [[ ! -d "${APP}" ]]; then
  APP="${BUILD_ROOT}/src-tauri/target/release/bundle/macos/orcAI Desktop.app"
fi
if [[ ! -d "${APP}" ]]; then
  echo "Build failed: .app not found" >&2
  exit 1
fi

echo "=== Embed portable Python in .app ==="
bash scripts/embed-python-in-built-app.sh "${APP}"

# Re-assert portable stubs after any post-embed codesign (never leave Mach-O launcher).
bash scripts/embed-python-framework.sh "${APP}/Contents/Resources/python/venv" --wrappers-only

echo "=== Ad-hoc sign ==="
PY_VENV="${APP}/Contents/Resources/python/venv"
PY_ROOT="${APP}/Contents/Resources/python"
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "${PY_ROOT}/Python.framework/Versions/3.11/Python" 2>/dev/null || true
  NESTED="${PY_ROOT}/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
  [[ -f "${NESTED}" ]] && codesign --force --sign - "${NESTED}" 2>/dev/null || true
  codesign --force --sign - "${PY_VENV}/bin/python3.11" 2>/dev/null || true
  find "${PY_ROOT}/dylibs" -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  find "${PY_ROOT}/Python.framework/Versions/3.11/lib" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  DYN="${PY_ROOT}/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"
  if [[ -d "${DYN}" ]]; then
    find "${DYN}" -type f -name "*.so" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  codesign --force --deep --sign - "${APP}" 2>/dev/null || true
fi

STAMP="/tmp/orcAI-Desktop_${VERSION}_aarch64.app"
STAMP_NEW="${STAMP}.new-$$"
rm -rf "${STAMP_NEW}"
ditto "${APP}" "${STAMP_NEW}"
xattr -cr "${STAMP_NEW}" 2>/dev/null || true
rm -rf "${STAMP}"
mv "${STAMP_NEW}" "${STAMP}"
bash scripts/embed-python-framework.sh "${STAMP}/Contents/Resources/python/venv" --wrappers-only
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/Python" 2>/dev/null || true
  NESTED_STAMP="${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
  [[ -f "${NESTED_STAMP}" ]] && codesign --force --sign - "${NESTED_STAMP}" 2>/dev/null || true
  codesign --force --sign - "${STAMP}/Contents/Resources/python/venv/bin/python3.11" 2>/dev/null || true
  find "${STAMP}/Contents/Resources/python/dylibs" -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  find "${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/lib" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  DYN_STAMP="${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"
  if [[ -d "${DYN_STAMP}" ]]; then
    find "${DYN_STAMP}" -type f -name "*.so" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  codesign --force --deep --sign - "${STAMP}" 2>/dev/null || true
fi

echo "=== AUTONOMY GATE (required) ==="
bash scripts/verify-app-python.sh "${STAMP}"
echo "=== Autonomy OK ==="

echo ""
echo "Built: ${APP}"
echo "Copied to: ${STAMP} ($(du -sh "${STAMP}" | cut -f1))"
