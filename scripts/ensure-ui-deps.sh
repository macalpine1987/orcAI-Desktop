#!/usr/bin/env bash
# Ensure apps/ui has happy-dom for component tests and tsc (auto-heal missing node_modules).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="${ROOT}/apps/ui"
HAPPY_DOM_VERSION="17.4.4"
TYPES_NODE_VERSION="22.10.0"
CACHED="/tmp/orcai-ui-test-deps/node_modules/happy-dom"
TYPES_CACHE="/tmp/orcai-ui-test-deps/node_modules/@types/node"

happy_dom_ready() {
  [[ -d "${UI}/node_modules/happy-dom" ]] || [[ -d "${CACHED}" ]]
}

types_node_ready() {
  [[ -d "${UI}/node_modules/@types/node" ]] || [[ -d "${TYPES_CACHE}" ]]
}

ui_deps_ready() {
  happy_dom_ready && types_node_ready
}

if ui_deps_ready; then
  exit 0
fi

echo "ensure-ui-deps: UI devDependencies missing — installing…" >&2

if [[ -f "${UI}/package-lock.json" || -f "${UI}/package.json" ]]; then
  if (cd "${UI}" && npm install --no-audit --no-fund); then
    if [[ -d "${UI}/node_modules/happy-dom" ]]; then
      echo "ensure-ui-deps: happy-dom installed in apps/ui/node_modules" >&2
      exit 0
    fi
  fi
fi

mkdir -p /tmp/orcai-ui-test-deps
if [[ ! -d "${CACHED}" ]]; then
  npm install "happy-dom@${HAPPY_DOM_VERSION}" --prefix /tmp/orcai-ui-test-deps --no-save --no-audit --no-fund
fi
if [[ ! -d "${TYPES_CACHE}" ]]; then
  npm install "@types/node@${TYPES_NODE_VERSION}" --prefix /tmp/orcai-ui-test-deps --no-save --no-audit --no-fund
fi

if [[ -d "${UI}/node_modules" && ! -e "${UI}/node_modules/happy-dom" ]]; then
  ln -sfn "${CACHED}" "${UI}/node_modules/happy-dom" 2>/dev/null || true
fi

if ui_deps_ready; then
  echo "ensure-ui-deps: OK (local node_modules and/or /tmp/orcai-ui-test-deps cache)" >&2
  exit 0
fi

echo "ensure-ui-deps: failed to provision UI test/build dependencies" >&2
echo "  Try: cd apps/ui && npm install" >&2
exit 1
