#!/usr/bin/env bash
# Wrap a built .app into a compressed DMG (run in macOS Terminal).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

find_app() {
  local candidates=(
    "${1:-}"
    "$ROOT/src-tauri/target/release/bundle/macos/orcAI Desktop.app"
    "/tmp/orcai-desktop-build/src-tauri/target/release/bundle/macos/orcAI Desktop.app"
    "/tmp/orcAI-Desktop_0.1.3_aarch64.app"
    "/tmp/orcAI-Desktop_0.1.0_aarch64.app"
  )
  for p in "${candidates[@]}"; do
    [[ -n "$p" && -d "$p" ]] && echo "$p" && return 0
  done
  return 1
}

APP="$(find_app "${1:-}" || true)"
OUT="${2:-/tmp/orcAI-Desktop_0.1.3_aarch64.dmg}"

if [[ -z "$APP" ]]; then
  echo "App bundle not found." >&2
  echo "" >&2
  echo "Build first:" >&2
  echo "  bash scripts/build-macos-release.sh" >&2
  echo "" >&2
  echo "Or pass the .app path:" >&2
  echo "  bash scripts/create-dmg.sh \"/path/to/orcAI Desktop.app\"" >&2
  exit 1
fi

echo "Using app: $APP"
rm -f "$OUT"
hdiutil create -volname "orcAI Desktop" -srcfolder "$APP" -ov -format UDZO "$OUT"
echo "Created: $OUT"
ls -lh "$OUT"
