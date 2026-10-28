#!/usr/bin/env bash
# Copy the current sidecar Python sources into a built .app (pip tarball may be stale).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-}"

if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  echo "sync-sidecar-into-app: .app path required" >&2
  exit 1
fi

SRC="${ROOT}/apps/sidecar/src/orcai_desktop_sidecar"
DEST="${APP}/Contents/Resources/python/venv/lib/python3.11/site-packages/orcai_desktop_sidecar"

if [[ ! -d "${SRC}" ]]; then
  echo "sync-sidecar-into-app: sidecar sources missing: ${SRC}" >&2
  exit 1
fi
if [[ ! -d "${DEST}" ]]; then
  echo "sync-sidecar-into-app: bundled sidecar package missing: ${DEST}" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  "${SRC}/" "${DEST}/"

echo "sync-sidecar-into-app: OK → ${DEST}"
