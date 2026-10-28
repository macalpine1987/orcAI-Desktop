#!/usr/bin/env bash
# Vendor Homebrew-linked dylibs into the embedded Python.framework lib/ and rewrite
# load commands to @loader_path so the .app runs on Macs without Homebrew/Python.
set -euo pipefail

BUNDLE_ROOT="${1:?usage: vendor-python-dylibs.sh /path/to/Contents/Resources/python}"
BUNDLE_ROOT="$(cd "${BUNDLE_ROOT}" && pwd)"
FW_LIB="${BUNDLE_ROOT}/Python.framework/Versions/3.11/lib"
VENDOR_DIR="${BUNDLE_ROOT}/dylibs"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "vendor-python-dylibs: skipped (not macOS)"
  exit 0
fi

if ! command -v otool >/dev/null || ! command -v install_name_tool >/dev/null; then
  echo "vendor-python-dylibs: otool/install_name_tool required" >&2
  exit 1
fi

if [[ ! -d "${FW_LIB}" ]]; then
  echo "vendor-python-dylibs: missing framework lib dir: ${FW_LIB}" >&2
  exit 1
fi

mkdir -p "${VENDOR_DIR}" "${FW_LIB}"

# Known Homebrew deps used by CPython 3.11 stdlib extensions on arm64/macOS.
# Paths may be /opt/homebrew/opt/... or /usr/local/opt/...
resolve_brew_lib() {
  local name="$1"
  local candidates=(
    "/opt/homebrew/opt/${name}"
    "/usr/local/opt/${name}"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -d "${c}/lib" ]]; then
      echo "${c}/lib"
      return 0
    fi
  done
  return 1
}

copy_named() {
  local src_dir="$1"
  local pattern="$2"
  local f
  for f in "${src_dir}"/${pattern}; do
    [[ -f "${f}" ]] || continue
    local base
    base="$(basename "${f}")"
    echo "  vendor ${f}"
    cp -p "${f}" "${VENDOR_DIR}/${base}"
    cp -p "${f}" "${FW_LIB}/${base}"
    chmod u+w "${VENDOR_DIR}/${base}" "${FW_LIB}/${base}" 2>/dev/null || true
    install_name_tool -id "@loader_path/${base}" "${FW_LIB}/${base}" 2>/dev/null || true
    install_name_tool -id "@rpath/${base}" "${VENDOR_DIR}/${base}" 2>/dev/null || true
  done
}

echo "vendor-python-dylibs: embedding CPython native deps into ${FW_LIB}"

if libdir="$(resolve_brew_lib openssl@3)"; then
  copy_named "${libdir}" "libssl.*.dylib"
  copy_named "${libdir}" "libcrypto.*.dylib"
fi
if libdir="$(resolve_brew_lib sqlite)"; then
  copy_named "${libdir}" "libsqlite3*.dylib"
fi
if libdir="$(resolve_brew_lib xz)"; then
  copy_named "${libdir}" "liblzma.*.dylib"
fi
if libdir="$(resolve_brew_lib mpdecimal)"; then
  copy_named "${libdir}" "libmpdec.*.dylib"
fi

# Fix openssl internal reference: libssl → libcrypto (same directory)
for ssl in "${FW_LIB}"/libssl.*.dylib "${VENDOR_DIR}"/libssl.*.dylib; do
  [[ -f "${ssl}" ]] || continue
  while IFS= read -r dep; do
    case "${dep}" in
      */libcrypto.*.dylib | */libcrypto.dylib)
        base="$(basename "${dep}")"
        install_name_tool -change "${dep}" "@loader_path/${base}" "${ssl}" 2>/dev/null || true
        ;;
    esac
  done < <(otool -L "${ssl}" 2>/dev/null | awk 'NR>1 {print $1}')
done

# Prefer real dylib files over versioned duplicates that are identical copies.
# Keep the SONAME used by extensions (e.g. libsqlite3.dylib, libmpdec.4.dylib).

rewrite_ext() {
  local binary="$1"
  [[ -f "${binary}" ]] || return 0
  file "${binary}" 2>/dev/null | grep -q "Mach-O" || return 0
  chmod u+w "${binary}" 2>/dev/null || true
  local dep base
  while IFS= read -r dep; do
    [[ -n "${dep}" ]] || continue
    case "${dep}" in
      /opt/homebrew/* | /usr/local/Cellar/* | /usr/local/opt/*)
        base="$(basename "${dep}")"
        if [[ -f "${FW_LIB}/${base}" ]]; then
          # lib-dynload/*.so lives in lib/python3.11/lib-dynload → ../../libNAME.dylib
          install_name_tool -change "${dep}" "@loader_path/../../${base}" "${binary}" 2>/dev/null || true
        elif [[ -f "${VENDOR_DIR}/${base}" ]]; then
          install_name_tool -change "${dep}" "@loader_path/../../../../dylibs/${base}" "${binary}" 2>/dev/null || true
        fi
        ;;
    esac
  done < <(otool -L "${binary}" 2>/dev/null | awk 'NR>1 {print $1}')
}

# Normalize wrong one-level @loader_path (legacy / bad rewrite):
#   @loader_path/../libssl.3.dylib  →  @loader_path/../../libssl.3.dylib
# lib-dynload is two levels below Versions/3.11/lib/, not one.
normalize_libdynload_loader_paths() {
  local dyn="$1"
  [[ -d "${dyn}" ]] || return 0
  local so dep base new
  while IFS= read -r -d '' so; do
    [[ -f "${so}" ]] || continue
    file "${so}" 2>/dev/null | grep -q "Mach-O" || continue
    chmod u+w "${so}" 2>/dev/null || true
    while IFS= read -r dep; do
      [[ -n "${dep}" ]] || continue
      # Exactly one "../" after @loader_path before a vendored lib*.dylib
      case "${dep}" in
        @loader_path/../lib*.dylib | @loader_path/../libmpdec*)
          base="$(basename "${dep}")"
          new="@loader_path/../../${base}"
          [[ "${dep}" == "${new}" ]] && continue
          echo "  normalize ${so##*/}: ${dep} → ${new}"
          install_name_tool -change "${dep}" "${new}" "${so}" 2>/dev/null || true
          ;;
      esac
    done < <(otool -L "${so}" 2>/dev/null | awk 'NR>1 {print $1}')
  done < <(find "${dyn}" -type f -name "*.so" -print0 2>/dev/null || true)
}

echo "vendor-python-dylibs: rewriting lib-dynload + venv extensions"
DYN="${FW_LIB}/python3.11/lib-dynload"
if [[ -d "${DYN}" ]]; then
  while IFS= read -r -d '' so; do
    rewrite_ext "${so}"
  done < <(find "${DYN}" -type f -name "*.so" -print0)
  echo "vendor-python-dylibs: normalizing @loader_path/../lib* → ../../"
  normalize_libdynload_loader_paths "${DYN}"
fi

VENV_DYN="${BUNDLE_ROOT}/venv/lib/python3.11/lib-dynload"
if [[ -d "${VENV_DYN}" ]]; then
  while IFS= read -r -d '' so; do
    # venv lib-dynload is deeper relative to FW_LIB — use vendor dir with computed path
    [[ -f "${so}" ]] || continue
    file "${so}" 2>/dev/null | grep -q "Mach-O" || continue
    chmod u+w "${so}" 2>/dev/null || true
    bin_dir="$(cd "$(dirname "${so}")" && pwd)"
    while IFS= read -r dep; do
      case "${dep}" in
        /opt/homebrew/* | /usr/local/Cellar/* | /usr/local/opt/*)
          base="$(basename "${dep}")"
          if [[ -f "${VENDOR_DIR}/${base}" ]]; then
            rel="$(python3 -c "import os; print(os.path.relpath(r'${VENDOR_DIR}/${base}', r'${bin_dir}'))")"
            install_name_tool -change "${dep}" "@loader_path/${rel}" "${so}" 2>/dev/null || true
          elif [[ -f "${FW_LIB}/${base}" ]]; then
            rel="$(python3 -c "import os; print(os.path.relpath(r'${FW_LIB}/${base}', r'${bin_dir}'))")"
            install_name_tool -change "${dep}" "@loader_path/${rel}" "${so}" 2>/dev/null || true
          fi
          ;;
      esac
    done < <(otool -L "${so}" 2>/dev/null | awk 'NR>1 {print $1}')
  done < <(find "${VENV_DYN}" -type f -name "*.so" -print0)
fi

# Fail if any lib-dynload still uses one-level @loader_path/../lib*
if [[ -d "${DYN}" ]]; then
  BAD_LOADER="$(
    find "${DYN}" -type f -name "*.so" 2>/dev/null | while IFS= read -r so; do
      otool -L "${so}" 2>/dev/null | awk -v f="${so}" 'NR>1 {print f " → " $1}'
    done | grep -E '@loader_path/\.\./[^./]' || true
  )"
  if [[ -n "${BAD_LOADER}" ]]; then
    echo "vendor-python-dylibs: ERROR one-level @loader_path/../lib* remains:" >&2
    echo "${BAD_LOADER}" >&2
    exit 1
  fi
fi

# Re-sign Mach-O we touched (install_name_tool invalidates the signature → SIGKILL).
if command -v codesign >/dev/null 2>&1; then
  echo "vendor-python-dylibs: ad-hoc codesign after install_name_tool"
  if [[ -d "${DYN}" ]]; then
    find "${DYN}" -type f -name "*.so" -print0 2>/dev/null \
      | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  fi
  find "${FW_LIB}" -maxdepth 1 -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
  find "${VENDOR_DIR}" -type f -name "*.dylib" -print0 2>/dev/null \
    | xargs -0 -n1 codesign --force --sign - 2>/dev/null || true
fi

# Interpreter: only allow @loader_path to embedded framework (no Homebrew Python)
for py in \
  "${BUNDLE_ROOT}/venv/bin/python3.11" \
  "${BUNDLE_ROOT}/venv/bin/python3" \
  "${BUNDLE_ROOT}/venv/bin/python"
do
  [[ -f "${py}" ]] || continue
  file "${py}" 2>/dev/null | grep -q "Mach-O" || continue
  chmod u+w "${py}" 2>/dev/null || true
  bin_dir="$(cd "$(dirname "${py}")" && pwd)"
  while IFS= read -r dep; do
    case "${dep}" in
      *Python.framework/Versions/3.11/Python)
        case "${dep}" in
          @loader_path/* | @rpath/*) ;;
          *)
            rel="$(python3 -c "import os; print(os.path.relpath(r'${BUNDLE_ROOT}/Python.framework/Versions/3.11/Python', r'${bin_dir}'))")"
            install_name_tool -change "${dep}" "@loader_path/${rel}" "${py}" 2>/dev/null || true
            ;;
        esac
        ;;
    esac
  done < <(otool -L "${py}" 2>/dev/null | awk 'NR>1 {print $1}')
done

# Keep framework install id stable (absolute Homebrew id is OK for identity;
# consumers use @loader_path). Do not rewrite to @loader_path/Python — that
# breaks CPython getpath on some builds.

echo "vendor-python-dylibs: verifying no Homebrew load paths remain"
LEAKS="$(
  {
    find "${DYN}" -type f -name "*.so" 2>/dev/null
    find "${VENV_DYN}" -type f -name "*.so" 2>/dev/null
    printf '%s\n' \
      "${BUNDLE_ROOT}/venv/bin/python3.11" \
      "${BUNDLE_ROOT}/venv/bin/python3" \
      "${BUNDLE_ROOT}/venv/bin/python"
    find "${VENDOR_DIR}" -type f -name "*.dylib" 2>/dev/null
    find "${FW_LIB}" -maxdepth 1 -type f -name "*.dylib" 2>/dev/null
  } | while IFS= read -r macho; do
      [[ -f "${macho}" ]] || continue
      otool -L "${macho}" 2>/dev/null | awk -v f="${macho}" 'NR>1 {print f " → " $1}'
    done | grep -E '/opt/homebrew|/usr/local/Cellar' || true
)"
if [[ -n "${LEAKS}" ]]; then
  echo "vendor-python-dylibs: ERROR external dylib refs remain:" >&2
  echo "${LEAKS}" >&2
  exit 1
fi

echo "vendor-python-dylibs: OK ($(du -sh "${VENDOR_DIR}" | cut -f1) dylibs)"
