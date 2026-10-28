#!/usr/bin/env bash
# Resolve a valid bundled Python root (directory containing venv/ and BUNDLE_PLATFORM).
# Source this file:  source scripts/resolve-bundled-python.sh
set -euo pipefail

_resolve_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_resolve_tag="$(uname -s)/$(uname -m)"

resolve_python_platform_tag() {
  printf '%s' "${_resolve_tag}"
}

resolve_python_cache_candidates() {
  local tag="${1:-${_resolve_tag}}"
  if [[ -n "${ORCAI_PYTHON_CACHE_DIR:-}" ]]; then
    printf '%s\n' "${ORCAI_PYTHON_CACHE_DIR}"
  fi
  printf '%s\n' \
    "${HOME}/.cache/orcai-desktop/python-bundle-${tag}" \
    "/tmp/orcai-desktop-python-${tag}" \
    "/tmp/orcai-desktop-python-rebuild"
}

# Returns 0 when ROOT looks like a complete bundle for the current platform.
verify_bundled_python_at() {
  local root="${1:?bundle root required}"
  local venv_py="${root}/venv/bin/python3"
  local stamp="${root}/BUNDLE_PLATFORM"
  local tag="${2:-${_resolve_tag}}"

  [[ -x "${venv_py}" ]] || return 1
  "${venv_py}" -c "
import orcai, orcai_desktop_sidecar
from orcai_desktop_sidecar.adapters.models import verify_builtin_models_bundle
verify_builtin_models_bundle()
" >/dev/null 2>/dev/null || return 1

  local py_real
  py_real="$("${venv_py}" -c 'import sys; print(sys.executable)' 2>/dev/null)" || return 1
  [[ -f "${py_real}" ]] || return 1

  if [[ -f "${stamp}" ]]; then
    [[ "$(tr -d '[:space:]' < "${stamp}")" == "${tag}" ]] || return 1
  fi
  return 0
}

# Echo the first valid bundle root, or nothing.
find_bundled_python_root() {
  local tag="${1:-${_resolve_tag}}"
  local candidate

  if [[ -n "${ORCAI_BUNDLED_PYTHON_DIR:-}" ]]; then
    if verify_bundled_python_at "${ORCAI_BUNDLED_PYTHON_DIR}" "${tag}"; then
      printf '%s' "${ORCAI_BUNDLED_PYTHON_DIR}"
      return 0
    fi
  fi

  candidate="${_resolve_root}/src-tauri/resources/python"
  if [[ -e "${candidate}" ]]; then
    if [[ -L "${candidate}" ]]; then
      candidate="$(cd "${candidate}" && pwd -P)"
    fi
    if verify_bundled_python_at "${candidate}" "${tag}"; then
      printf '%s' "${candidate}"
      return 0
    fi
  fi

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] || continue
    if verify_bundled_python_at "${candidate}" "${tag}"; then
      printf '%s' "${candidate}"
      return 0
    fi
  done < <(resolve_python_cache_candidates "${tag}")

  return 1
}

export_orcai_bundled_python_env() {
  local env_file="${1:-/tmp/orcai-desktop-bundled-python.env}"
  local root="${2:?bundle root required}"
  printf 'ORCAI_BUNDLED_PYTHON_DIR=%s\n' "${root}" >"${env_file}"
}
