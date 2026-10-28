#!/usr/bin/env bash
# Turn a venv into a self-contained tree: replace symlinks that point outside the venv.
# Required for .app bundles — Homebrew-linked python3.11 breaks on other machines.
set -euo pipefail

VENV="${1:?usage: make-python-venv-portable.sh /path/to/venv}"
if [[ ! -d "${VENV}/bin" ]]; then
  echo "Not a venv: ${VENV}" >&2
  exit 1
fi
VENV="$(cd "${VENV}" && pwd)"

is_inside_venv() {
  local p="$1"
  case "${p}" in
    "${VENV}" | "${VENV}"/*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_link() {
  local link="$1"
  local target
  target="$(readlink "${link}")"
  if [[ "${target}" != /* ]]; then
    echo "$(cd "$(dirname "${link}")" && pwd)/${target}"
  else
    echo "${target}"
  fi
}

materialize_link() {
  local link="$1"
  local resolved="$2"
  echo "  materialize $(basename "${link}") ← ${resolved}"
  rm -f "${link}"
  if [[ -d "${resolved}" ]]; then
    cp -R "${resolved}" "${link}"
  else
    cp -p "${resolved}" "${link}"
  fi
  if [[ -f "${link}" && -x "${resolved}" ]]; then
    chmod +x "${link}" 2>/dev/null || true
  fi
}

echo "orcAI Desktop: making venv portable → ${VENV}"

for _pass in 1 2 3 4 5 6 7 8; do
  fixed=0
  while IFS= read -r -d '' link; do
    [[ -L "${link}" ]] || continue
    resolved="$(resolve_link "${link}")"
    if [[ -L "${resolved}" ]]; then
      resolved="$(readlink -f "${resolved}" 2>/dev/null || resolve_link "${resolved}")"
    fi
    if is_inside_venv "${resolved}"; then
      continue
    fi
    if [[ ! -e "${resolved}" ]]; then
      echo "WARN broken symlink (skipped): ${link}" >&2
      continue
    fi
    materialize_link "${link}" "${resolved}"
    fixed=1
  done < <(find "${VENV}" -type l -print0 2>/dev/null || true)
  [[ "${fixed}" -eq 0 ]] && break
done

# bin/ must not point outside the venv
for entry in "${VENV}/bin/"*; do
  [[ -e "${entry}" || -L "${entry}" ]] || continue
  if [[ -L "${entry}" ]]; then
    resolved="$(readlink -f "${entry}" 2>/dev/null || true)"
    if [[ -n "${resolved}" ]] && ! is_inside_venv "${resolved}"; then
      echo "ERROR: ${entry} still links outside venv → ${resolved}" >&2
      exit 1
    fi
  fi
done

PY="${VENV}/bin/python3.11"
[[ -x "${PY}" ]] || PY="${VENV}/bin/python3"
[[ -x "${PY}" ]] || PY="${VENV}/bin/python"

if ! "${PY}" -c "import orcai_desktop_sidecar, orcai" 2>/dev/null; then
  echo "ERROR: portable venv cannot import orcAI sidecar" >&2
  "${PY}" -c "import orcai_desktop_sidecar, orcai" 2>&1 || true
  exit 1
fi

# macOS: warn if the interpreter still loads dylibs from Homebrew (common with brew python)
if [[ "$(uname -s)" == "Darwin" ]] && command -v otool >/dev/null 2>&1; then
  if otool -L "${PY}" 2>/dev/null | grep -qE '/opt/homebrew|/usr/local/Cellar'; then
    echo "NOTE: Python binary still references Homebrew dylibs; prefer python.org 3.11 for redistribution." >&2
    echo "      Install from https://www.python.org/downloads/ and re-run bundle-python.sh" >&2
  fi
fi

echo "Portable venv OK ($(du -sh "${VENV}" | cut -f1))"
