#!/usr/bin/env bash
# Remove build-machine search paths from a bundled Python tree.
# Keeps @loader_path and @executable_path. Does not codesign: the caller
# re-signs after install_name_tool, which invalidates the ad-hoc signature.
set -euo pipefail

PY_ROOT="${1:?usage: strip-host-search-paths.sh /path/to/Contents/Resources/python}"

if [[ ! -d "${PY_ROOT}" ]]; then
  echo "strip-host-search-paths: not a directory: ${PY_ROOT}" >&2
  exit 1
fi

if ! command -v otool >/dev/null 2>&1 || ! command -v install_name_tool >/dev/null 2>&1; then
  echo "strip-host-search-paths: otool and install_name_tool are required" >&2
  exit 1
fi

is_host_path() {
  case "$1" in
    /opt/homebrew | /opt/homebrew/* | /usr/local | /usr/local/* | /Users | /Users/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

removed_pc=0
while IFS= read -r -d '' pc; do
  if grep -qE '/opt/homebrew|/usr/local/Cellar|/usr/local/opt|/Users/' "${pc}"; then
    rm -f "${pc}"
    removed_pc=$((removed_pc + 1))
  fi
done < <(find "${PY_ROOT}" -type f -name '*.pc' -print0 2>/dev/null || true)

removed_rpath=0
while IFS= read -r -d '' macho; do
  [[ -f "${macho}" ]] || continue
  file "${macho}" 2>/dev/null | grep -q "Mach-O" || continue
  while IFS= read -r rpath; do
    [[ -n "${rpath}" ]] || continue
    if is_host_path "${rpath}"; then
      install_name_tool -delete_rpath "${rpath}" "${macho}" 2>/dev/null || true
      removed_rpath=$((removed_rpath + 1))
    fi
  done < <(
    otool -l "${macho}" 2>/dev/null | awk '
      /cmd LC_RPATH/ { grab=1; next }
      grab && $1 == "path" {
        sub(/^[[:space:]]*path[[:space:]]+/, "")
        sub(/ \(offset [0-9]+\)$/, "")
        print
        grab=0
      }
    '
  )
done < <(find "${PY_ROOT}" \( -name '*.so' -o -name '*.dylib' -o -name 'Python' -o -name 'python3*' \) -type f -print0 2>/dev/null || true)

echo "strip-host-search-paths: removed ${removed_pc} pkgconfig file(s), ${removed_rpath} host rpath(s)"
