#!/usr/bin/env bash
# Verify a built .app ships a fully autonomous Python runtime (post-build GATE).
# Fail the release if the .app needs system Python or Homebrew on the target Mac.
set -euo pipefail

APP="${1:?usage: verify-app-python.sh '/path/to/orcAI Desktop.app'}"

resolve_symlink() {
  local link="$1"
  local target
  target="$(readlink "${link}" 2>/dev/null || true)"
  [[ -n "${target}" ]] || return 1
  if [[ "${target}" != /* ]]; then
    echo "$(cd "$(dirname "${link}")" && pwd)/${target}"
  else
    echo "${target}"
  fi
}

fail() {
  echo "AUTONOMY GATE FAILED: $*" >&2
  exit 1
}

echo "=== AUTONOMY GATE: ${APP} ==="

if [[ ! -d "${APP}" ]]; then
  fail ".app not found: ${APP}"
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Unsupported platform for this script (add Windows layout if needed)" >&2
  exit 1
fi

PY="${APP}/Contents/Resources/python/venv/bin/python3.11"
if [[ ! -x "${PY}" ]]; then
  PY="${APP}/Contents/Resources/python/venv/bin/python3"
fi
RES="${APP}/Contents/Resources"
PY_ROOT="${APP}/Contents/Resources/python"
VENV="${PY_ROOT}/venv"
CFG="${VENV}/pyvenv.cfg"
NESTED_PY="${PY_ROOT}/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
DYN="${PY_ROOT}/Python.framework/Versions/3.11/lib/python3.11/lib-dynload"

[[ -x "${PY}" ]] || fail "bundled python missing: ${PY}"
[[ -f "${PY_ROOT}/Python.framework/Versions/3.11/Python" ]] || fail "missing embedded Python.framework"
[[ -d "${PY_ROOT}/dylibs" ]] || fail "missing vendored dylibs (python/dylibs)"
[[ -f "${NESTED_PY}" ]] || fail "missing nested Python.app (stub target): ${NESTED_PY}"

# Critical CPython native deps must be present inside the bundle.
for need in libssl.3.dylib libcrypto.3.dylib libsqlite3.dylib liblzma.5.dylib libmpdec.4.dylib; do
  if [[ ! -f "${PY_ROOT}/dylibs/${need}" ]] && [[ ! -f "${PY_ROOT}/Python.framework/Versions/3.11/lib/${need}" ]]; then
    fail "missing vendored ${need}"
  fi
done

# --- 1. Stub must be bash, not Mach-O __PYVENV_LAUNCHER__ -----------------------
echo "Checking portable venv stub (not Mach-O pyvenv launcher)…"
FILE_OUT="$(file "${PY}" 2>/dev/null || true)"
if echo "${FILE_OUT}" | grep -q "Mach-O"; then
  fail "venv python3.11 is Mach-O (pyvenv launcher) — must be bash stub: ${PY}"
fi
if ! echo "${FILE_OUT}" | grep -qiE 'script|text|bash'; then
  fail "venv python3.11 is not a text/bash script: ${FILE_OUT}"
fi
SHEBANG="$(head -1 "${PY}" 2>/dev/null || true)"
case "${SHEBANG}" in
  "#!/bin/bash" | "#!/usr/bin/env bash" | "#!"*"bash") ;;
  *)
    fail "venv stub shebang must be bash, got: ${SHEBANG}"
    ;;
esac
if ! grep -q 'PYTHONHOME' "${PY}"; then
  fail "venv stub missing PYTHONHOME"
fi
if ! grep -q 'Python.app/Contents/MacOS/Python' "${PY}"; then
  fail "venv stub missing exec of Python.app/Contents/MacOS/Python"
fi

# --- 2. pyvenv.cfg must use relative framework paths ----------------------------
echo "Checking portable pyvenv.cfg…"
[[ -f "${CFG}" ]] || fail "missing ${CFG}"
# Forbid exactly `home = .` (cwd-relative). Relative `../Python.framework/...` is OK.
if grep -E '^[[:space:]]*home[[:space:]]*=[[:space:]]*\.[[:space:]]*$' "${CFG}" >/dev/null; then
  fail "pyvenv.cfg home= . is not portable"
fi
if ! grep -E '^[[:space:]]*home[[:space:]]*=' "${CFG}" | grep -q 'Python.framework/Versions/3.11/bin'; then
  fail "pyvenv.cfg home= must contain Python.framework/Versions/3.11/bin"
fi
if grep -E '^[[:space:]]*executable[[:space:]]*=' "${CFG}" | grep -qv 'Python.framework'; then
  fail "pyvenv.cfg executable= must reference Python.framework (not bare bin/python3)"
fi
if grep -qE '/opt/homebrew|/usr/local/Cellar|/Users/' "${CFG}"; then
  fail "pyvenv.cfg contains absolute build-machine paths"
fi

# --- 3. lib-dynload @loader_path must be ../../ not ../ ------------------------
echo "Checking lib-dynload @loader_path depth…"
if [[ -d "${DYN}" ]]; then
  for mod in _ssl _hashlib _sqlite3 _lzma _decimal; do
    so="$(find "${DYN}" -maxdepth 1 -type f -name "${mod}*.so" 2>/dev/null | head -1 || true)"
    [[ -n "${so}" && -f "${so}" ]] || continue
    if otool -L "${so}" 2>/dev/null | grep -E '@loader_path/\.\./[^./]' >/dev/null; then
      echo "otool -L ${so}:" >&2
      otool -L "${so}" >&2 || true
      fail "${mod}: forbidden one-level @loader_path/../lib* (need ../../)"
    fi
  done
  BAD_LOADER="$(
    find "${DYN}" -type f -name "*.so" 2>/dev/null | while IFS= read -r so; do
      otool -L "${so}" 2>/dev/null | awk -v f="${so}" 'NR>1 {print f " → " $1}'
    done | grep -E '@loader_path/\.\./[^./]' || true
  )"
  if [[ -n "${BAD_LOADER}" ]]; then
    echo "${BAD_LOADER}" | head -20 >&2
    fail "lib-dynload still has @loader_path/../lib* (one level)"
  fi
fi

# --- 4. Launch from foreign cwd (critical) — light import first ----------------
echo "Launch test with cwd=/tmp (light: _socket/ssl/sidecar)…"
LIGHT_ERR="$(mktemp)"
LIGHT_OUT="$(mktemp)"
set +e
(
  cd /tmp && env -i \
    PATH="/usr/bin:/bin" \
    HOME="${HOME}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    ORCAI_DESKTOP_RESOURCE_DIR="${RES}" \
    "${PY}" -c "import _socket, ssl, sqlite3, orcai_desktop_sidecar; print('gate-ok')"
) >"${LIGHT_OUT}" 2>"${LIGHT_ERR}"
LIGHT_RC=$?
set -e
LIGHT_STDERR="$(cat "${LIGHT_ERR}")"
LIGHT_STDOUT="$(cat "${LIGHT_OUT}")"
rm -f "${LIGHT_ERR}" "${LIGHT_OUT}"

if [[ "${LIGHT_RC}" -eq 137 ]] || echo "${LIGHT_STDERR}" | grep -qiE 'Code Signature Invalid|killed|SIGKILL'; then
  fail "light import killed (Code Signature Invalid?) rc=${LIGHT_RC}"
fi
if echo "${LIGHT_STDERR}" | grep -q 'Could not find platform dependent libraries'; then
  fail "exec_prefix / platform libraries missing (cwd-relative pyvenv launcher?)"
fi
if [[ "${LIGHT_RC}" -ne 0 ]]; then
  echo "${LIGHT_STDERR}" >&2
  fail "light import failed rc=${LIGHT_RC}"
fi
echo "${LIGHT_STDOUT}" | grep -q 'gate-ok' || fail "light import missing gate-ok"

# Full orcAI import (heavy / TF) — optional via ORCAI_GATE_FULL=1; always try with timeout budget.
if [[ "${ORCAI_GATE_FULL:-1}" == "1" ]]; then
  echo "Checking ${PY} (full: orcai + models)…"
  ORCAI_DESKTOP_RESOURCE_DIR="${RES}" "${PY}" -c "
import orcai, orcai_desktop_sidecar
from orcai_desktop_sidecar.adapters.models import verify_builtin_models_bundle
print('orcAI', orcai.__version__ if hasattr(orcai, '__version__') else 'ok')
print('models', len(verify_builtin_models_bundle()))
"
  echo "Checking sidecar module launch (same path the desktop app uses)…"
  ORCAI_DESKTOP_RESOURCE_DIR="${RES}" "${PY}" -c "import orcai_desktop_sidecar.main"
fi

echo "Simulating .app relocation (ditto copy)…"
RELOC="/tmp/orcai-desktop-verify-reloc-$$.app"
rm -rf "${RELOC}"
ditto "${APP}" "${RELOC}"
RELOC_PY="${RELOC}/Contents/Resources/python/venv/bin/python3.11"
[[ -x "${RELOC_PY}" ]] || RELOC_PY="${RELOC}/Contents/Resources/python/venv/bin/python3"
RELOC_RES="${RELOC}/Contents/Resources"
(
  cd /tmp && env -i \
    PATH="/usr/bin:/bin" \
    HOME="${HOME}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    ORCAI_DESKTOP_RESOURCE_DIR="${RELOC_RES}" \
    "${RELOC_PY}" -c "import _socket, ssl, orcai_desktop_sidecar; print('reloc-ok')"
) >/dev/null
rm -rf "${RELOC}"

# No bin/python symlinks escaping the bundle
while IFS= read -r -d '' link; do
  target="$(resolve_symlink "${link}" || true)"
  if [[ -z "${target}" ]]; then
    echo "WARN: could not resolve symlink (skipped): ${link}" >&2
    continue
  fi
  case "${target}" in
    "${APP}"/*) ;;
    *)
      fail "external symlink in bundle: ${link} → ${target}"
      ;;
  esac
done < <(find "${APP}/Contents/Resources/python/venv/bin" -type l -print0 2>/dev/null || true)

if ! command -v otool >/dev/null 2>&1; then
  fail "otool required to verify Mach-O portability"
fi

echo "Scanning bundled python Mach-O for Homebrew leaks (incl. Python.app)…"
LEAKS="$(
  find "${APP}/Contents/Resources/python" \( \
      -name 'Python' -o \
      -name 'python3*' -o \
      -name '*.so' -o \
      -name '*.dylib' \
    \) -type f 2>/dev/null | while IFS= read -r macho; do
      [[ -f "${macho}" ]] || continue
      file "${macho}" 2>/dev/null | grep -q "Mach-O" || continue
      self_id="$(otool -D "${macho}" 2>/dev/null | awk 'NR==2 {print $1}')"
      otool -L "${macho}" 2>/dev/null | awk -v f="${macho}" -v sid="${self_id}" '
        NR>1 {
          dep=$1
          if (sid != "" && dep == sid) next
          print f " → " dep
        }'
    done | grep -E '/opt/homebrew|/usr/local/Cellar|/usr/local/opt' || true
)"
if [[ -n "${LEAKS}" ]]; then
  echo "${LEAKS}" | head -40 >&2
  fail "Homebrew dylib references remain"
fi

echo "Checking host LC_RPATH and pkgconfig prefixes…"
HOST_RPATH="$(
  find "${APP}/Contents/Resources/python" \( \
      -name 'Python' -o \
      -name 'python3*' -o \
      -name '*.so' -o \
      -name '*.dylib' \
    \) -type f 2>/dev/null | while IFS= read -r macho; do
      [[ -f "${macho}" ]] || continue
      file "${macho}" 2>/dev/null | grep -q "Mach-O" || continue
      otool -l "${macho}" 2>/dev/null | awk -v f="${macho}" '
        /cmd LC_RPATH/ { grab=1; next }
        grab && $1 == "path" {
          sub(/^[[:space:]]*path[[:space:]]+/, "")
          sub(/ \(offset [0-9]+\)$/, "")
          if ($0 ~ /^\/opt\/homebrew/ || $0 ~ /^\/usr\/local/ || $0 ~ /^\/Users\//) {
            print f " → " $0
          }
          grab=0
        }
      '
    done || true
)"
if [[ -n "${HOST_RPATH}" ]]; then
  echo "${HOST_RPATH}" | head -20 >&2
  fail "host LC_RPATH remains (Homebrew or build home)"
fi
HOST_PC="$(
  find "${APP}/Contents/Resources/python" -type f -name '*.pc' -print0 2>/dev/null \
    | xargs -0 grep -lE '/opt/homebrew|/usr/local/Cellar|/usr/local/opt|/Users/' 2>/dev/null || true
)"
if [[ -n "${HOST_PC}" ]]; then
  echo "${HOST_PC}" >&2
  fail "pkgconfig still points at the build machine"
fi

echo "Checking nested Python.app load paths…"
if otool -L "${NESTED_PY}" 2>/dev/null | grep -qE '/opt/homebrew|/usr/local/Cellar|/usr/local/opt'; then
  otool -L "${NESTED_PY}" >&2 || true
  fail "nested Python.app still links to Homebrew: ${NESTED_PY}"
fi

# Smoke: no Homebrew on PATH — ssl + light modules (full orcai already covered above).
echo "Import smoke test with PATH=/usr/bin:/bin (no Homebrew)…"
env -i \
  PATH="/usr/bin:/bin" \
  HOME="${HOME}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  ORCAI_DESKTOP_RESOURCE_DIR="${RES}" \
  "${PY}" -c "import ssl, sqlite3, orcai_desktop_sidecar; print('autonomous-ok', ssl.OPENSSL_VERSION)"

echo "AUTONOMY GATE PASSED"
echo "App Python bundle OK"
