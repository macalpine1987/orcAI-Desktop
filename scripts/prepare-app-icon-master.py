#!/usr/bin/env python3
"""Build a 1024×1024 RGBA app-icon master with transparent corners.

The orcAI source art is a landscape RGB PNG (squircle drawn on an opaque
white canvas). macOS does not mask .icns the way iOS masks app icons, so
opaque corners show up as a sharp square in Finder/Dock.

This script:
  1. Flood-fills near-white canvas from the corners → alpha 0
  2. Feathers the anti-aliased silhouette
  3. Fits the remaining artwork into a square plate (no crop)
  4. Fills letterbox with the icon background and clips to a macOS squircle
  5. Centers the plate on a 1024 canvas with transparent margin (CONTENT_SCALE)
     so the Dock/Finder silhouette matches stock macOS optical size
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from collections import deque
from pathlib import Path

OUT_SIZE = 1024
# Distance to white: canvas is 0–6, squircle fill ~34–40.
BG_DIST = 10
FEATHER_DIST = 28
# Apple Big Sur+ app icon corner radius (~228px on a 1024 canvas).
SQUIRCLE_RADIUS = 0.2237
# Optical size vs Dock/Finder neighbours. Full-bleed squircles read ~10–15%
# larger than stock macOS icons; keep a transparent margin around the plate.
CONTENT_SCALE = 0.84


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _dist_white(r: int, g: int, b: int) -> int:
    return (255 - r) + (255 - g) + (255 - b)


def read_png_rgba(path: Path) -> tuple[int, int, bytearray]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    pos = 8
    width = height = color = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bit, color, *_ = struct.unpack(">IIBBBBB", chunk)
            if bit != 8 or color not in (2, 6):
                raise ValueError(f"unsupported PNG (bit={bit} color={color})")
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
    assert width and height and color is not None
    raw = zlib.decompress(idat)
    bpp = 3 if color == 2 else 4
    stride = width * bpp
    prev = bytearray(stride)
    rgba = bytearray(width * height * 4)
    i = 0
    out = 0
    for _y in range(height):
        filt = raw[i]
        i += 1
        cur = bytearray(raw[i : i + stride])
        i += stride
        for x in range(stride):
            a = cur[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            v = cur[x]
            if filt == 1:
                cur[x] = (v + a) & 255
            elif filt == 2:
                cur[x] = (v + b) & 255
            elif filt == 3:
                cur[x] = (v + ((a + b) // 2)) & 255
            elif filt == 4:
                cur[x] = (v + _paeth(a, b, c)) & 255
            elif filt != 0:
                raise ValueError(f"bad PNG filter {filt}")
        prev = cur
        if color == 6:
            rgba[out : out + stride] = cur
            out += stride
        else:
            for x in range(0, stride, 3):
                rgba[out : out + 3] = cur[x : x + 3]
                rgba[out + 3] = 255
                out += 4
    return width, height, rgba


def write_png_rgba(path: Path, width: int, height: int, rgba: bytes) -> None:
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


def _corners_transparent(width: int, height: int, rgba: bytearray) -> bool:
    for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if rgba[(y * width + x) * 4 + 3] > 8:
            return False
    return True


def punch_white_canvas(width: int, height: int, rgba: bytearray) -> None:
    """Flood-fill near-white from the four corners, then feather the edge."""
    n = width * height
    seen = bytearray(n)
    q: deque[int] = deque()
    for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        q.append(y * width + x)
    while q:
        i = q.popleft()
        if seen[i]:
            continue
        seen[i] = 1
        o = i * 4
        if _dist_white(rgba[o], rgba[o + 1], rgba[o + 2]) > BG_DIST:
            continue
        rgba[o + 3] = 0
        x, y = i % width, i // width
        if x > 0:
            q.append(i - 1)
        if x + 1 < width:
            q.append(i + 1)
        if y > 0:
            q.append(i - width)
        if y + 1 < height:
            q.append(i + width)

    span = FEATHER_DIST - BG_DIST
    for i in range(n):
        o = i * 4
        if rgba[o + 3] == 0:
            continue
        dist = _dist_white(rgba[o], rgba[o + 1], rgba[o + 2])
        if dist >= FEATHER_DIST:
            continue
        x, y = i % width, i // width
        touches = False
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and rgba[(ny * width + nx) * 4 + 3] == 0:
                touches = True
                break
        if not touches:
            continue
        if dist <= BG_DIST:
            rgba[o + 3] = 0
        else:
            rgba[o + 3] = min(255, int(round(255 * (dist - BG_DIST) / span)))


def _alpha_bbox(width: int, height: int, rgba: bytearray) -> tuple[int, int, int, int]:
    minx, miny, maxx, maxy = width, height, -1, -1
    for y in range(height):
        row = y * width
        for x in range(width):
            if rgba[(row + x) * 4 + 3] > 8:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx < 0:
        raise ValueError("icon artwork vanished after punching the canvas")
    return minx, miny, maxx, maxy


def resize_contain(width: int, height: int, rgba: bytearray, size: int) -> bytearray:
    minx, miny, maxx, maxy = _alpha_bbox(width, height, rgba)
    bw = maxx - minx + 1
    bh = maxy - miny + 1
    scale = min(size / bw, size / bh)
    dw = max(1, int(round(bw * scale)))
    dh = max(1, int(round(bh * scale)))
    ox = (size - dw) // 2
    oy = (size - dh) // 2
    out = bytearray(size * size * 4)
    # Inverse mapping with bilinear sample of the bbox.
    for y in range(dh):
        sy = miny + (y + 0.5) / scale - 0.5
        y0 = int(sy)
        y1 = min(y0 + 1, height - 1)
        y0 = max(0, y0)
        fy = sy - y0
        for x in range(dw):
            sx = minx + (x + 0.5) / scale - 0.5
            x0 = int(sx)
            x1 = min(x0 + 1, width - 1)
            x0 = max(0, x0)
            fx = sx - x0
            acc = [0.0, 0.0, 0.0, 0.0]
            for wx, ix in ((1 - fx, x0), (fx, x1)):
                for wy, iy in ((1 - fy, y0), (fy, y1)):
                    wgt = wx * wy
                    o = (iy * width + ix) * 4
                    acc[0] += rgba[o] * wgt
                    acc[1] += rgba[o + 1] * wgt
                    acc[2] += rgba[o + 2] * wgt
                    acc[3] += rgba[o + 3] * wgt
            d = ((oy + y) * size + (ox + x)) * 4
            out[d] = int(acc[0] + 0.5)
            out[d + 1] = int(acc[1] + 0.5)
            out[d + 2] = int(acc[2] + 0.5)
            out[d + 3] = int(acc[3] + 0.5)
    return out


def _sample_fill(width: int, height: int, rgba: bytearray) -> tuple[int, int, int]:
    o = ((height // 6) * width + (width // 2)) * 4
    if rgba[o + 3] > 200:
        return rgba[o], rgba[o + 1], rgba[o + 2]
    return 232, 243, 252


def composite_on_fill(size: int, rgba: bytearray, fill: tuple[int, int, int]) -> None:
    fr, fg, fb = fill
    for i in range(0, size * size * 4, 4):
        a = rgba[i + 3]
        if a >= 255:
            continue
        if a <= 0:
            rgba[i] = fr
            rgba[i + 1] = fg
            rgba[i + 2] = fb
            rgba[i + 3] = 255
            continue
        t = a / 255.0
        rgba[i] = int(rgba[i] * t + fr * (1 - t) + 0.5)
        rgba[i + 1] = int(rgba[i + 1] * t + fg * (1 - t) + 0.5)
        rgba[i + 2] = int(rgba[i + 2] * t + fb * (1 - t) + 0.5)
        rgba[i + 3] = 255


def apply_squircle_mask(size: int, rgba: bytearray, radius_frac: float = SQUIRCLE_RADIUS) -> None:
    """Clip to a rounded square with ~1px coverage AA (macOS icon silhouette)."""
    half = size / 2.0
    radius = size * radius_frac
    for y in range(size):
        py = abs((y + 0.5) - half)
        qy = py - half + radius
        for x in range(size):
            px = abs((x + 0.5) - half)
            qx = px - half + radius
            mx = qx if qx > 0.0 else 0.0
            my = qy if qy > 0.0 else 0.0
            mxy = qx if qx > qy else qy
            sd = (mxy if mxy < 0.0 else 0.0) + (mx * mx + my * my) ** 0.5 - radius
            cover = 0.5 - sd
            o = (y * size + x) * 4
            if cover >= 1.0:
                continue
            if cover <= 0.0:
                rgba[o + 3] = 0
            else:
                rgba[o + 3] = int(rgba[o + 3] * cover + 0.5)


def place_centered(inner: bytearray, inner_size: int, canvas_size: int) -> bytearray:
    """Paste an RGBA plate onto a larger transparent canvas (optical margin)."""
    out = bytearray(canvas_size * canvas_size * 4)
    ox = (canvas_size - inner_size) // 2
    oy = (canvas_size - inner_size) // 2
    for y in range(inner_size):
        src_row = y * inner_size * 4
        dst_row = ((oy + y) * canvas_size + ox) * 4
        out[dst_row : dst_row + inner_size * 4] = inner[src_row : src_row + inner_size * 4]
    return out


def prepare(
    src: Path,
    dest: Path,
    size: int = OUT_SIZE,
    content_scale: float = CONTENT_SCALE,
) -> None:
    width, height, rgba = read_png_rgba(src)
    if not _corners_transparent(width, height, rgba):
        punch_white_canvas(width, height, rgba)
    fill = _sample_fill(width, height, rgba)
    scale = min(1.0, max(0.5, float(content_scale)))
    inner = max(64, int(round(size * scale)))
    # Keep even sizes so centering is symmetric on the Dock grid.
    if inner % 2:
        inner -= 1
    plate = resize_contain(width, height, rgba, inner)
    composite_on_fill(inner, plate, fill)
    apply_squircle_mask(inner, plate)
    if inner < size:
        master = place_centered(plate, inner, size)
    else:
        master = plate
    if not _corners_transparent(size, size, master):
        raise SystemExit("master corners are still opaque — refusing to write a square icon")
    write_png_rgba(dest, size, size, master)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("src", type=Path)
    parser.add_argument("dest", type=Path)
    parser.add_argument("--size", type=int, default=OUT_SIZE)
    parser.add_argument(
        "--content-scale",
        type=float,
        default=CONTENT_SCALE,
        help=f"squircle plate size as fraction of canvas (default {CONTENT_SCALE})",
    )
    args = parser.parse_args()
    if not args.src.is_file():
        print(f"missing icon source: {args.src}", file=sys.stderr)
        return 1
    args.dest.parent.mkdir(parents=True, exist_ok=True)
    prepare(args.src, args.dest, args.size, content_scale=args.content_scale)
    print(
        f"prepare-app-icon-master: {args.src} → {args.dest} "
        f"({args.size}×{args.size} RGBA, content_scale={args.content_scale})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
