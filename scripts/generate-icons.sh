#!/usr/bin/env bash
# Generate app icons for Tauri bundles (macOS .icns, PNG sizes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ICONS_DIR="$ROOT/src-tauri/icons"
WORK="${TMPDIR:-/tmp}/orcai-icon-master-$$"
mkdir -p "$WORK"

resolve_icon_src() {
  if [[ -n "${1:-}" ]]; then
    echo "$1"
    return
  fi
  local candidates=(
    "$ROOT/assets/icon.png"
  )
  local workspace_v2="$(cd "$ROOT/.." 2>/dev/null && pwd)/assets/orcai-icon-a-fin-body-v2.png"
  if [[ -f "$workspace_v2" ]] && [[ "$ROOT" != *orcai-desktop-build* ]]; then
    candidates+=("$workspace_v2")
  fi
  workspace_v2="${WORKSPACE_ICON:-}"
  if [[ -n "$workspace_v2" && -f "$workspace_v2" ]]; then
    candidates+=("$workspace_v2")
  fi
  local c
  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]]; then
      echo "$c"
      return
    fi
  done
  echo ""
}

ICON_SRC="$(resolve_icon_src "${1:-}")"
if [[ -z "$ICON_SRC" ]]; then
  echo "No icon source found. Pass a 1024×1024 PNG or place assets at:" >&2
  echo "  $ROOT/assets/icon.png" >&2
  echo "  <workspace>/assets/orcai-icon-a-fin-body-v2.png" >&2
  exit 1
fi

echo "=== App icon source: $ICON_SRC ==="
cp "$ICON_SRC" "$WORK/src.png"
MASTER="$WORK/icon.png"
# Opaque landscape PNG + sips center-crop → square Finder/Dock icon.
# Punch the white canvas and fit the squircle into 1024×1024 RGBA (keep alpha).
if python3 "$ROOT/scripts/prepare-app-icon-master.py" "$WORK/src.png" "$MASTER"; then
  :
elif command -v sips >/dev/null 2>&1; then
  echo "WARN: prepare-app-icon-master.py failed — sips crop (opaque corners)" >&2
  sips -c 1024 1024 "$WORK/src.png" --out "$MASTER" >/dev/null 2>&1 || cp "$WORK/src.png" "$MASTER"
  sips -z 1024 1024 "$MASTER" --out "$MASTER" >/dev/null 2>&1 || true
else
  cp "$WORK/src.png" "$MASTER"
fi

mkdir -p "$ICONS_DIR"

# Prefer a local CLI binary — avoid `npx --yes` network fetches during release builds.
TAURI_BIN=""
if [[ -x "$ROOT/node_modules/.bin/tauri" ]]; then
  TAURI_BIN="$ROOT/node_modules/.bin/tauri"
elif [[ -x "$ROOT/apps/ui/node_modules/.bin/tauri" ]]; then
  TAURI_BIN="$ROOT/apps/ui/node_modules/.bin/tauri"
fi

if [[ -n "$TAURI_BIN" ]]; then
  echo "Generating icons via local @tauri-apps/cli → $ICONS_DIR"
  "$TAURI_BIN" icon "$MASTER" -o "$ICONS_DIR"
  rm -rf "$WORK"
  echo "Icons ready in $ICONS_DIR"
  exit 0
fi

if [[ -d "$ROOT/apps/ui/node_modules/@tauri-apps/cli" ]] || [[ -d "$ROOT/node_modules/@tauri-apps/cli" ]]; then
  echo "Generating icons via npm exec @tauri-apps/cli → $ICONS_DIR"
  (
    cd "$ROOT"
    npm exec --no-install -- @tauri-apps/cli icon "$MASTER" -o "$ICONS_DIR"
  )
  rm -rf "$WORK"
  echo "Icons ready in $ICONS_DIR"
  exit 0
fi

if command -v npx >/dev/null 2>&1; then
  echo "Generating icons via npx @tauri-apps/cli (network fallback)"
  (
    cd "$ROOT/apps/ui"
    npx --yes @tauri-apps/cli icon "$MASTER" -o "$ICONS_DIR"
  )
  rm -rf "$WORK"
  exit 0
fi

echo "WARN: Node/npx not available — falling back to placeholder icons" >&2
python3 <<'PY'
import struct, zlib, pathlib

def png_rgba(w: int, h: int, r: int, g: int, b: int, a: int = 255) -> bytes:
    row = b"\x00" + bytes([r, g, b, a]) * w
    raw = row * h
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    return sig + ihdr + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")

png = png_rgba(512, 512, 0x1a, 0x5c, 0x8a)
root = pathlib.Path("src-tauri/icons")
root.mkdir(parents=True, exist_ok=True)
for name in ("icon.png", "128x128.png", "128x128@2x.png", "32x32.png"):
    (root / name).write_bytes(png)
print("Wrote placeholder PNG icons.")
PY

build_icns() {
  local iconset="${ICONS_DIR}/AppIcon.iconset"
  local src="${ICONS_DIR}/icon.png"
  rm -rf "$iconset"
  mkdir -p "$iconset"
  sips -z 16 16 "$src" --out "${iconset}/icon_16x16.png" >/dev/null
  sips -z 32 32 "$src" --out "${iconset}/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$src" --out "${iconset}/icon_32x32.png" >/dev/null
  sips -z 64 64 "$src" --out "${iconset}/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$src" --out "${iconset}/icon_128x128.png" >/dev/null
  sips -z 256 256 "$src" --out "${iconset}/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$src" --out "${iconset}/icon_256x256.png" >/dev/null
  sips -z 512 512 "$src" --out "${iconset}/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$src" --out "${iconset}/icon_512x512.png" >/dev/null
  sips -z 1024 1024 "$src" --out "${iconset}/icon_512x512@2x.png" >/dev/null
  xattr -cr "$iconset" 2>/dev/null || true
  iconutil -c icns "$iconset" -o "${ICONS_DIR}/icon.icns"
  rm -rf "$iconset"
}

if command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  cp "$MASTER" "${ICONS_DIR}/icon.png"
  build_icns
  echo "Built ${ICONS_DIR}/icon.icns via iconutil"
fi

rm -rf "$WORK"
