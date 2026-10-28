#!/usr/bin/env bash
# Embed Python.framework next to venv and relink Mach-O deps (Homebrew → @loader_path).
#
# Homebrew's python3.11 stub posix_spawn's
#   Python.framework/.../Resources/Python.app/Contents/MacOS/Python
# That nested binary ships with absolute Cellar load paths. Relinking only
# venv/bin/python* is not enough — the whole framework tree must be portable.
set -euo pipefail

VENV="${1:?usage: embed-python-framework.sh /path/to/venv [--wrappers-only]}"
WRAPPERS_ONLY=false
if [[ "${2:-}" == "--wrappers-only" ]]; then
  WRAPPERS_ONLY=true
fi
if [[ ! -d "${VENV}/bin" ]]; then
  echo "Not a venv: ${VENV}" >&2
  exit 1
fi

# Physical paths everywhere: /tmp → /private/tmp on macOS; mixing logical and
# physical paths makes loader_relpath climb to / and emit a broken @loader_path.
VENV="$(cd "${VENV}" && pwd -P)"
BUNDLE_ROOT="$(cd "${VENV}/.." && pwd -P)"
PY_BIN="${VENV}/bin/python3.11"
[[ -f "${PY_BIN}" ]] || PY_BIN="${VENV}/bin/python3"
[[ -e "${PY_BIN}" || "${WRAPPERS_ONLY}" == "true" ]] || {
  echo "embed-python-framework: interpreter missing in ${VENV}/bin" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Portable venv launcher (bash stub). Mach-O __PYVENV_LAUNCHER__ resolves
# pyvenv.cfg `home=` relative to cwd — breaks when Tauri starts the sidecar
# with cwd ≠ venv (Could not find platform dependent libraries <exec_prefix>).
# ---------------------------------------------------------------------------
write_portable_pyvenv_cfg() {
  local venv="$1"
  cat > "${venv}/pyvenv.cfg" <<'EOF'
home = ../Python.framework/Versions/3.11/bin
include-system-site-packages = false
version = 3.11
executable = ../Python.framework/Versions/3.11/bin/python3.11
command = ../Python.framework/Versions/3.11/bin/python3.11 -m venv --copies .
EOF
}

install_portable_python_wrapper() {
  local venv="$1"
  local bin="${venv}/bin"
  local nested="${venv}/../Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
  if [[ ! -f "${nested}" ]]; then
    echo "embed-python-framework: ERROR nested Python.app missing (required by stub): ${nested}" >&2
    exit 1
  fi
  mkdir -p "${bin}"
  local name dest
  for name in python3.11 python3 python; do
    dest="${bin}/${name}"
    # Replace Mach-O pyvenv launcher / copies with a cwd-independent bash stub.
    cat > "${dest}" <<'STUB'
#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$(cd "${HERE}/.." && pwd)"
BUNDLE="$(cd "${VENV}/.." && pwd)"
export PYTHONHOME="${BUNDLE}/Python.framework/Versions/3.11"
export VIRTUAL_ENV="${VENV}"
SITE="${VENV}/lib/python3.11/site-packages"
if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="${SITE}:${PYTHONPATH}"
else
  export PYTHONPATH="${SITE}"
fi
exec "${PYTHONHOME}/Resources/Python.app/Contents/MacOS/Python" "$@"
STUB
    chmod +x "${dest}"
  done
  write_portable_pyvenv_cfg "${venv}"
  echo "embed-python-framework: portable bash stubs + relative pyvenv.cfg installed"
}

if [[ "${WRAPPERS_ONLY}" == "true" ]]; then
  install_portable_python_wrapper "${VENV}"
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "embed-python-framework: skipped (not macOS)"
  exit 0
fi

if ! command -v otool >/dev/null 2>&1 || ! command -v install_name_tool >/dev/null 2>&1; then
  echo "embed-python-framework: otool/install_name_tool required" >&2
  exit 1
fi

[[ -x "${PY_BIN}" ]] || {
  echo "embed-python-framework: interpreter missing in ${VENV}/bin" >&2
  exit 1
}

DEST_FRAMEWORK="${BUNDLE_ROOT}/Python.framework"
FW_PY="${DEST_FRAMEWORK}/Versions/3.11/Python"
PORTABLE_ID="@rpath/Python.framework/Versions/3.11/Python"

loader_relpath() {
  local binary="$1"
  local target="$2"
  /usr/bin/python3 -c 'import os,sys; print(os.path.relpath(os.path.realpath(sys.argv[2]), os.path.dirname(os.path.realpath(sys.argv[1]))))' \
    "${binary}" "${target}"
}

is_python_framework_dep() {
  local dep="$1"
  case "${dep}" in
    */Python.framework/Versions/3.11/Python | */Python.framework/Versions/Current/Python)
      return 0
      ;;
  esac
  return 1
}

relink_binary_to_fw() {
  local binary="$1"
  [[ -f "${binary}" ]] || return 0
  # Never patch Mach-O outside the bundle (e.g. venv/bin/python3.11 → Homebrew symlink).
  case "$(cd "$(dirname "${binary}")" 2>/dev/null && pwd -P)/$(basename "${binary}")" in
    "${BUNDLE_ROOT}"/*) ;;
    *)
      echo "embed-python-framework: skip external binary ${binary}" >&2
      return 0
      ;;
  esac
  file "${binary}" 2>/dev/null | grep -q "Mach-O" || return 0
  chmod u+w "${binary}" 2>/dev/null || true

  local dep rel new
  while IFS= read -r dep; do
    [[ -n "${dep}" ]] || continue
    if is_python_framework_dep "${dep}"; then
      rel="$(loader_relpath "${binary}" "${FW_PY}")"
      new="@loader_path/${rel}"
      [[ "${dep}" == "${new}" ]] && continue
      install_name_tool -change "${dep}" "${new}" "${binary}" 2>/dev/null || true
    fi
  done < <(otool -L "${binary}" 2>/dev/null | awk 'NR>1 {print $1}')
}

# Prefer Mach-O candidates only — scanning every file under the framework is huge/slow.
framework_macho_candidates() {
  local root="$1"
  find "${root}/Versions/3.11" \( \
      -name 'Python' -o \
      -name 'python3*' -o \
      -name '*.so' -o \
      -name '*.dylib' \
    \) -type f 2>/dev/null || true
}

# Only Python.framework absolute/Cellar load paths — OpenSSL/sqlite/xz are fixed later
# by vendor-python-dylibs.sh.
scan_python_framework_leaks() {
  local root="$1"
  framework_macho_candidates "${root}" | while IFS= read -r macho; do
    [[ -f "${macho}" ]] || continue
    file "${macho}" 2>/dev/null | grep -q "Mach-O" || continue
    local sid
    sid="$(otool -D "${macho}" 2>/dev/null | awk 'NR==2 {print $1}')"
    otool -L "${macho}" 2>/dev/null | awk -v f="${macho}" -v sid="${sid}" '
      NR>1 {
        dep=$1
        if (sid != "" && dep == sid) next
        print f " → " dep
      }'
  done | grep -E '/opt/homebrew/.*/Python\.framework|/usr/local/.*/Python\.framework|/opt/homebrew/Cellar/python|/usr/local/Cellar/python' || true
}

needs_embed=false
while IFS= read -r dep; do
  [[ -n "${dep}" ]] || continue
  needs_embed=true
  break
done < <(otool -L "${PY_BIN}" 2>/dev/null | awk 'NR>1 {print $1}' | grep -E 'Python\.framework/Versions/(3\.11|Current)/Python$' || true)

# Copy framework once when missing. If present but still has Cellar Python load paths,
# do NOT re-rsync (expensive / can be killed) — just relink below.
if [[ ! -f "${FW_PY}" ]]; then
  if [[ "${needs_embed}" != "true" ]]; then
    echo "embed-python-framework: no Python.framework dependency on interpreter and no framework" >&2
    exit 1
  fi
  SRC_FRAMEWORK="/opt/homebrew/opt/python@3.11/Frameworks/Python.framework"
  if [[ ! -f "${SRC_FRAMEWORK}/Versions/3.11/Python" ]]; then
    SRC_FRAMEWORK="/usr/local/opt/python@3.11/Frameworks/Python.framework"
  fi
  if [[ ! -f "${SRC_FRAMEWORK}/Versions/3.11/Python" ]]; then
    echo "embed-python-framework: Homebrew/python.org Python.framework not found" >&2
    exit 1
  fi

  echo "embed-python-framework: embedding ${SRC_FRAMEWORK} → ${DEST_FRAMEWORK}"
  rm -rf "${DEST_FRAMEWORK}"
  mkdir -p "${DEST_FRAMEWORK}/Versions"
  rsync -a "${SRC_FRAMEWORK}/Versions/3.11/" "${DEST_FRAMEWORK}/Versions/3.11/"
  ln -sfn 3.11 "${DEST_FRAMEWORK}/Versions/Current"
  ln -sfn Versions/Current/Python "${DEST_FRAMEWORK}/Python"
else
  echo "embed-python-framework: framework present; refreshing Mach-O relinks"
fi

if [[ ! -f "${FW_PY}" ]]; then
  echo "embed-python-framework: missing ${FW_PY}" >&2
  exit 1
fi

chmod u+w "${FW_PY}" 2>/dev/null || true
install_name_tool -id "${PORTABLE_ID}" "${FW_PY}" 2>/dev/null || true

echo "embed-python-framework: relinking framework Mach-O (incl. Python.app stub target)"
while IFS= read -r binary; do
  relink_binary_to_fw "${binary}"
done < <(framework_macho_candidates "${DEST_FRAMEWORK}")

echo "embed-python-framework: relinking interpreter and stdlib extensions"
for binary in "${PY_BIN}" "${VENV}/bin/python3" "${VENV}/bin/python"; do
  [[ -e "${binary}" ]] || continue
  if [[ -L "${binary}" ]]; then
    binary="$(readlink -f "${binary}" 2>/dev/null || echo "${binary}")"
  fi
  relink_binary_to_fw "${binary}"
done

while IFS= read -r -d '' binary; do
  relink_binary_to_fw "${binary}"
done < <(find "${VENV}/lib/python3.11/lib-dynload" -type f -name "*.so" -print0 2>/dev/null || true)

INTERP="${PY_BIN}"
while IFS= read -r -d '' script; do
  [[ -f "${script}" ]] || continue
  file "${script}" 2>/dev/null | grep -qE 'text|script' || continue
  head -1 "${script}" 2>/dev/null | grep -q '^#!' || continue
  tail -n +2 "${script}" > "${script}.body"
  printf '#!%s\n' "${INTERP}" > "${script}"
  cat "${script}.body" >> "${script}"
  rm -f "${script}.body"
  chmod +x "${script}" 2>/dev/null || true
done < <(find "${VENV}/bin" -maxdepth 1 -type f -print0 2>/dev/null || true)

FW_LEAKS="$(scan_python_framework_leaks "${DEST_FRAMEWORK}")"
if [[ -n "${FW_LEAKS}" ]]; then
  echo "embed-python-framework: ERROR framework still references Homebrew Python:" >&2
  echo "${FW_LEAKS}" | head -40 >&2
  exit 1
fi

if otool -L "${PY_BIN}" 2>/dev/null | grep -qE '/opt/homebrew|/usr/local/Cellar|/usr/local/opt'; then
  echo "embed-python-framework: ERROR interpreter still references external Python dylib" >&2
  otool -L "${PY_BIN}" >&2 || true
  exit 1
fi

NESTED="${DEST_FRAMEWORK}/Versions/3.11/Resources/Python.app/Contents/MacOS/Python"
if [[ -f "${NESTED}" ]]; then
  if otool -L "${NESTED}" 2>/dev/null | grep -qE '/opt/homebrew|/usr/local/Cellar|/usr/local/opt'; then
    echo "embed-python-framework: ERROR nested Python.app still references Homebrew" >&2
    otool -L "${NESTED}" >&2 || true
    exit 1
  fi
fi

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "${FW_PY}" 2>/dev/null || true
  codesign --force --sign - "${PY_BIN}" 2>/dev/null || true
  if [[ -f "${NESTED}" ]]; then
    codesign --force --sign - "${NESTED}" 2>/dev/null || true
  fi
fi

# materialize-bundled-python copies python3/python separately; relinking can diverge.
# Keep one canonical interpreter and alias the venv entrypoints the app launches.
for alias in python3 python; do
  dest="${VENV}/bin/${alias}"
  [[ "${dest}" == "${PY_BIN}" ]] && continue
  rm -f "${dest}"
  cp -p "${PY_BIN}" "${dest}"
  chmod +x "${dest}"
  if command -v codesign >/dev/null 2>&1; then
    codesign --force --sign - "${dest}" 2>/dev/null || true
  fi
done

ORCAI_DESKTOP_RESOURCE_DIR="${BUNDLE_ROOT}" "${PY_BIN}" -c "import orcai, orcai_desktop_sidecar" >/dev/null
echo "embed-python-framework: OK ($(du -sh "${DEST_FRAMEWORK}" | cut -f1) framework)"

# Stubs last inside this script too (vendor may re-run wrappers-only after).
install_portable_python_wrapper "${VENV}"
