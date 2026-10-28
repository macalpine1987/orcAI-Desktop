#!/usr/bin/env bash
# Full macOS release build (uses /tmp when the Cursor workspace cannot write node_modules).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ASSETS="$(cd "${ROOT}/.." && pwd)/assets"
# Also support Cursor layout: repo may live under .../empty-window/orcai-desktop
if [[ ! -f "${WORKSPACE_ASSETS}/orcai-icon-a-fin-body-v2.png" ]]; then
  WORKSPACE_ASSETS="${ROOT}/../assets"
fi
BUILD_ROOT="${BUILD_ROOT:-/tmp/orcai-desktop-build}"
export PATH="${HOME}/.cargo/bin:/opt/homebrew/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-/tmp/cargo-home}"
# Keep Cargo artifacts under BUILD_ROOT even when Cursor redirects default target dirs.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${BUILD_ROOT}/src-tauri/target}"
# Avoid sandbox cargo-target redirects that break stamping.
if [[ "${CARGO_TARGET_DIR}" == *cursor-sandbox-cache* ]]; then
  export CARGO_TARGET_DIR="${BUILD_ROOT}/src-tauri/target"
fi
export PIP_DEFAULT_TIMEOUT="${PIP_DEFAULT_TIMEOUT:-180}"
export PIP_RETRIES="${PIP_RETRIES:-15}"
export ORCAI_BUNDLE_MODE="${ORCAI_BUNDLE_MODE:-tarball}"
export ORCAI_PYTHON_SOURCE="${ORCAI_PYTHON_SOURCE:-/tmp/orcai-desktop-python-rebuild}"

echo "=== Sync sources → ${BUILD_ROOT} ==="
mkdir -p "${BUILD_ROOT}"
rsync -a --delete \
  --exclude '.cursor' \
  --exclude 'src-tauri/target' \
  --exclude 'apps/ui/node_modules' \
  --exclude 'node_modules' \
  --exclude 'src-tauri/resources/python' \
  "${ROOT}/" "${BUILD_ROOT}/"

ICON_V2="${WORKSPACE_ASSETS}/orcai-icon-a-fin-body-v2.png"
if [[ -f "${ICON_V2}" ]]; then
  mkdir -p "${BUILD_ROOT}/assets"
  cp "${ICON_V2}" "${BUILD_ROOT}/assets/icon.png"
  echo "Bundled app icon from ${ICON_V2}"
fi

cd "${BUILD_ROOT}"
bash scripts/vendor-bit-vec.sh
npm install
npm install --prefix apps/ui

echo "=== Prepare Python + UI + icons ==="
bash scripts/prepare-production.sh

echo "=== Tauri build (.app) ==="
# UI already built by prepare-production; skip heavy beforeBuild if needed
npm run tauri build -- --bundles app

APP="${CARGO_TARGET_DIR}/release/bundle/macos/orcAI Desktop.app"
if [[ ! -d "${APP}" ]]; then
  # Fallback for older layouts
  APP="${BUILD_ROOT}/src-tauri/target/release/bundle/macos/orcAI Desktop.app"
fi
if [[ ! -d "${APP}" ]]; then
  echo "Build failed: .app not found at ${CARGO_TARGET_DIR}/release/bundle/macos/orcAI Desktop.app" >&2
  exit 1
fi
echo "Using .app at: ${APP}"

VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
echo "=== Release version ${VERSION} ==="

echo "=== Embed portable Python in .app ==="
bash scripts/embed-python-in-built-app.sh "${APP}"

# Re-assert portable stubs after any post-embed codesign (never leave Mach-O launcher).
bash scripts/embed-python-framework.sh "${APP}/Contents/Resources/python/venv" --wrappers-only

echo "=== Ad-hoc sign + autonomy prep ==="
PY_VENV="${APP}/Contents/Resources/python/venv"
PY_ROOT="${APP}/Contents/Resources/python"
if [[ -d "${PY_VENV}" ]]; then
  if command -v codesign >/dev/null 2>&1; then
    codesign --force --sign - "${PY_ROOT}/Python.framework/Versions/3.11/Python" 2>/dev/null || true
    NESTED="${PY_ROOT}/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
    [[ -f "${NESTED}" ]] && codesign --force --sign - "${NESTED}" 2>/dev/null || true
    # python3.11 is a bash stub — codesign is a no-op / harmless
    codesign --force --sign - "${PY_VENV}/bin/python3.11" 2>/dev/null || true
    if [[ -d "${PY_ROOT}/dylibs" ]]; then
      find "${PY_ROOT}/dylibs" -type f -name "*.dylib" -print0 2>/dev/null \
        | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
    fi
    find "${PY_ROOT}/Python.framework/Versions/3.11/lib" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
    DYN="${PY_ROOT}/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"
    if [[ -d "${DYN}" ]]; then
      find "${DYN}" -type f -name "*.so" -print0 2>/dev/null \
        | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
    fi
    codesign --force --deep --sign - "${APP}" 2>/dev/null || true
  fi
fi

# Finder shows the .app filename under the icon. CFBundleDisplayName does not
# override a versioned filename such as orcAI-Desktop_0.1.28_aarch64.app.
# The version stays in Info.plist (Get Info). The bundle name is the product name.
STAMP="/tmp/orcAI Desktop.app"
# Stage into a fresh path first — overwriting a running/locked .app often yields
# ditto "Operation not permitted" and a half-copied stamp.
STAMP_NEW="${STAMP}.new-$$"
rm -rf "${STAMP_NEW}"
ditto "${APP}" "${STAMP_NEW}"
xattr -cr "${STAMP_NEW}" 2>/dev/null || true
rm -rf "${STAMP}"
mv "${STAMP_NEW}" "${STAMP}"
# Stubs again on stamp (ditto is faithful; belt-and-suspenders after any stamp codesign).
bash scripts/embed-python-framework.sh "${STAMP}/Contents/Resources/python/venv" --wrappers-only
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/Python" 2>/dev/null || true
  NESTED_STAMP="${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
  [[ -f "${NESTED_STAMP}" ]] && codesign --force --sign - "${NESTED_STAMP}" 2>/dev/null || true
  codesign --force --sign - "${STAMP}/Contents/Resources/python/venv/bin/python3.11" 2>/dev/null || true
  if [[ -d "${STAMP}/Contents/Resources/python/dylibs" ]]; then
    find "${STAMP}/Contents/Resources/python/dylibs" -type f -name "*.dylib" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  find "${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/lib" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  DYN_STAMP="${STAMP}/Contents/Resources/python/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"
  if [[ -d "${DYN_STAMP}" ]]; then
    find "${DYN_STAMP}" -type f -name "*.so" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  codesign --force --deep --sign - "${STAMP}" 2>/dev/null || true
fi

echo "=== AUTONOMY GATE (required — clean Mac, no system Python) ==="
bash scripts/verify-app-python.sh "${STAMP}"
echo "=== Autonomy OK — releasing stamp ${STAMP} ==="

BASELINE_SRC="/tmp/orcai-desktop-baseline-v${VERSION}-src"
BASELINE_APP="/tmp/orcai-desktop-baseline-v${VERSION}-app"
echo "=== Snapshot v${VERSION} baseline (source + .app) ==="
rsync -a --delete \
  --exclude '.cursor' \
  --exclude 'src-tauri/target' \
  --exclude 'apps/ui/node_modules' \
  --exclude 'node_modules' \
  --exclude 'src-tauri/resources/python' \
  "${ROOT}/" "${BASELINE_SRC}/"
rm -rf "${BASELINE_APP}"
ditto "${STAMP}" "${BASELINE_APP}"
xattr -cr "${BASELINE_APP}" 2>/dev/null || true

echo ""
echo "Built: ${APP}"
echo "Copied to: ${STAMP}"
echo "Baseline source: ${BASELINE_SRC}"
echo "Baseline .app: ${BASELINE_APP}"
echo "DMG: bash scripts/create-dmg.sh \"${STAMP}\""
