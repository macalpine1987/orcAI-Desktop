"""PNG tile encoding for spectrogram viewports."""

from __future__ import annotations

import io

import numpy as np

from orcai_desktop_sidecar.adapters.spectrogram_meta import (
    _read_orcai_parameter,
    _resolve_parameter_path,
    get_wav_meta,
)
from orcai_desktop_sidecar.adapters.spectrogram_render import (
    apply_colormap,
    normalize_display_kind,
    normalize_spectrogram_to_uint8,
)


def _resize_image(image: np.ndarray, width: int, height: int) -> np.ndarray:
    from PIL import Image

    img = Image.fromarray(image, mode="L")
    img = img.resize((width, height), resample=Image.Resampling.BILINEAR)
    return np.asarray(img, dtype=np.uint8)


def _to_uint8_gray(chunk: np.ndarray) -> np.ndarray:
    """Map orcAI preprocessed spectrogram (already 0–1) to uint8 without re-stretching."""
    if chunk.size == 0:
        return np.zeros((1, 1), dtype=np.uint8)
    x = np.asarray(chunk, dtype=np.float64)
    return (np.clip(x, 0.0, 1.0) * 255.0).astype(np.uint8)


def render_spectrogram_tile_png(
    wav_path: str,
    *,
    t0: float = 0.0,
    t1: float | None = None,
    width: int = 800,
    height: int = 256,
    channel: int = 1,
    orcai_parameter: str | None = None,
    display_kind: str = "orcai",
    colormap: str = "inferno",
    vmin: float = 0.0,
    vmax: float = 1.0,
    windowed: bool = False,
) -> bytes:
    # Lazy imports avoid a cycle with the spectrogram façade chunk loaders.
    from orcai_desktop_sidecar.adapters.spectrogram import (
        _load_orcai_spectrogram_chunk,
        _load_power_chunk,
    )

    meta = get_wav_meta(wav_path)
    duration = meta["duration_sec"]
    if t1 is None:
        t1 = duration
    t0 = max(0.0, t0)
    t1 = min(duration, t1)
    if t1 <= t0:
        t1 = min(duration, t0 + 1.0)

    # Match Desktop UI budget (SPECTROGRAM_TILE_MAX_WIDTH_PX); keep headroom for API.
    width = max(64, min(width, 2048))
    height = max(32, min(height, 2048))

    param_path = _resolve_parameter_path(orcai_parameter)
    param = _read_orcai_parameter(param_path)
    kind = normalize_display_kind(display_kind)
    if kind == "linear":
        chunk = _load_power_chunk(
            wav_path,
            t0=t0,
            t1=t1,
            channel=channel,
            orcai_parameter_path=param_path,
            display_kind=kind,
            windowed=windowed,
        )
        gray = normalize_spectrogram_to_uint8(
            chunk,
            param,
            vmin_norm=vmin,
            vmax_norm=vmax,
            input_domain="linear",
        )
    else:
        chunk = _load_orcai_spectrogram_chunk(
            wav_path,
            t0=t0,
            t1=t1,
            channel=channel,
            orcai_parameter_path=param_path,
            windowed=windowed,
        )
        gray = _to_uint8_gray(chunk)
    gray = np.flipud(gray.T)
    raster = _resize_image(gray, width, height)
    cmap_name = (colormap or "inferno").lower().strip()

    from PIL import Image

    buf = io.BytesIO()
    # Desktop fetches gray tiles and recolors in-canvas — L + fast zlib is
    # much cheaper than RGB PNG on every resize / pan.
    if cmap_name == "gray":
        Image.fromarray(raster, mode="L").save(
            buf, format="PNG", compress_level=1
        )
    else:
        rgb = apply_colormap(raster, cmap_name)
        Image.fromarray(rgb, mode="RGB").save(
            buf, format="PNG", compress_level=1
        )
    return buf.getvalue()
