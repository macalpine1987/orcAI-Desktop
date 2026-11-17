"""Colormap and normalization helpers for spectrogram tiles."""

from __future__ import annotations

import numpy as np

DisplayKind = str  # "orcai" | "linear" (| legacy "log_mel")
ColormapName = str  # "inferno" | "viridis" | "gray"

# orcAI desktop viewer: fixed linear axis and resampling target.
# Matches orcAI default spectrogram.freq_range upper bound (16 kHz).
ORCAI_VIEW_FMAX_HZ = 16_000.0
ORCAI_VIEW_SAMPLE_RATE_HZ = 48_000.0

# Defaults match orcai.defaults.default_orcai_parameter.json → spectrogram.
ORCAI_DEFAULT_NFFT = 512
ORCAI_DEFAULT_HOP = 256
ORCAI_DEFAULT_QUANTILES = (0.01, 0.999)


def normalize_display_kind(display_kind: str | None) -> str:
    """Map API display_kind to internal path: ``orcai`` or ``linear``."""
    kind = (display_kind or "orcai").lower().replace("-", "_")
    if kind in {"orcai", "linear_orcai", "log_mel", "logmel"}:
        return "orcai"
    if kind == "linear":
        return "linear"
    return "orcai"


def spectrogram_parameter_section(orcai_parameter: dict) -> dict:
    """Return nested `spectrogram` block from orcAI parameter JSON when present."""
    nested = orcai_parameter.get("spectrogram")
    if isinstance(nested, dict):
        return nested
    return orcai_parameter


def normalize_spectrogram_to_uint8(
    chunk: np.ndarray,
    orcai_parameter: dict,
    *,
    vmin_norm: float = 0.0,
    vmax_norm: float = 1.0,
    input_domain: str = "db",
) -> np.ndarray:
    """Map a spectrogram slice to uint8 using orcAI quantile stretch (make_spectrogram)."""
    if chunk.size == 0:
        return np.zeros((1, 1), dtype=np.uint8)

    x = np.asarray(chunk, dtype=np.float64)
    domain = (input_domain or "db").lower().replace("-", "_")
    if domain == "linear":
        # Same as librosa.amplitude_to_db(..., ref=peak) without pulling numba
        # (bundle librosa+numba can fail guvectorize on some hosts).
        peak = float(np.max(x))
        if peak > 1e-12:
            x = 20.0 * np.log10(np.maximum(x, 0.0) / peak + 1e-12)
        else:
            x = np.zeros_like(x)

    spec = spectrogram_parameter_section(orcai_parameter)
    quantiles = spec.get("quantiles", list(ORCAI_DEFAULT_QUANTILES))
    if not isinstance(quantiles, (list, tuple)) or len(quantiles) < 2:
        quantiles = list(ORCAI_DEFAULT_QUANTILES)
    lo_pct = float(quantiles[0]) * 100.0
    hi_pct = float(quantiles[1]) * 100.0
    lo = float(np.percentile(x, lo_pct, method="nearest"))
    hi = float(np.percentile(x, hi_pct, method="nearest"))
    if hi <= lo:
        hi = lo + 1e-6
    scaled = np.clip((x - lo) / (hi - lo), 0.0, 1.0)

    v0 = float(np.clip(vmin_norm, 0.0, 1.0))
    v1 = float(np.clip(vmax_norm, 0.0, 1.0))
    if v1 > v0 + 1e-6:
        scaled = np.clip((scaled - v0) / (v1 - v0), 0.0, 1.0)

    out = (scaled * 255).astype(np.uint8)
    if out.size > 0 and float(out.std()) < 1.0:
        lo_px = float(out.min())
        hi_px = float(out.max())
        if hi_px > lo_px:
            out = ((out.astype(np.float32) - lo_px) / (hi_px - lo_px) * 255).astype(
                np.uint8,
            )
    return out


def normalize_to_uint8(
    chunk: np.ndarray,
    *,
    vmin_norm: float = 0.0,
    vmax_norm: float = 1.0,
    lo_percentile: float = 2.0,
    hi_percentile: float = 98.0,
    orcai_parameter: dict | None = None,
) -> np.ndarray:
    """Legacy wrapper — prefer normalize_spectrogram_to_uint8 for tiles."""
    if orcai_parameter is not None:
        return normalize_spectrogram_to_uint8(
            chunk,
            orcai_parameter,
            vmin_norm=vmin_norm,
            vmax_norm=vmax_norm,
            input_domain="linear",
        )
    if chunk.size == 0:
        return np.zeros((1, 1), dtype=np.uint8)
    # Log compress dynamic range (Audacity-style) before percentile stretch.
    x = np.maximum(np.asarray(chunk, dtype=np.float64), 0.0)
    peak = float(x.max())
    if peak > 1e-12:
        x = np.log1p(x / peak * 1000.0) / np.log1p(1000.0)
    lo = float(np.percentile(x, lo_percentile))
    hi = float(np.percentile(x, hi_percentile))
    if hi <= lo:
        hi = lo + 1e-6
    scaled = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    v0 = float(np.clip(vmin_norm, 0.0, 1.0))
    v1 = float(np.clip(vmax_norm, 0.0, 1.0))
    if v1 > v0 + 1e-6:
        scaled = np.clip((scaled - v0) / (v1 - v0), 0.0, 1.0)
    out = (scaled * 255).astype(np.uint8)
    if out.size > 0 and float(out.std()) < 1.0:
        lo_px = float(out.min())
        hi_px = float(out.max())
        if hi_px > lo_px:
            out = ((out.astype(np.float32) - lo_px) / (hi_px - lo_px) * 255).astype(
                np.uint8,
            )
    return out


def _lut_inferno() -> np.ndarray:
    try:
        from matplotlib import cm

        cmap = cm.get_cmap("inferno")
        return (cmap(np.linspace(0, 1, 256))[:, :3] * 255).astype(np.uint8)
    except (ImportError, AttributeError, ValueError, TypeError):
        t = np.linspace(0, 1, 256)
        r = np.clip(255 * (1.2 * t), 0, 255)
        g = np.clip(255 * (t**1.5), 0, 255)
        b = np.clip(255 * ((1 - t) ** 0.5), 0, 255)
        return np.stack([r, g, b], axis=1).astype(np.uint8)


def _lut_viridis() -> np.ndarray:
    try:
        from matplotlib import cm

        cmap = cm.get_cmap("viridis")
        return (cmap(np.linspace(0, 1, 256))[:, :3] * 255).astype(np.uint8)
    except (ImportError, AttributeError, ValueError, TypeError):
        t = np.linspace(0, 1, 256)
        r = 68 + 187 * t
        g = 1 + 254 * t
        b = 84 + 68 * (1 - t)
        return np.stack([r, g, b], axis=1).astype(np.uint8)


_LUT_CACHE: dict[str, np.ndarray] = {
    "inferno": _lut_inferno(),
    "viridis": _lut_viridis(),
}


def _colormap_lut(cmap_name: str) -> np.ndarray:
    name = (cmap_name or "inferno").lower().strip()
    if name == "gray":
        raise ValueError("gray is handled separately")
    if name not in _LUT_CACHE:
        if name == "viridis":
            _LUT_CACHE[name] = _lut_viridis()
        elif name == "inferno":
            _LUT_CACHE[name] = _lut_inferno()
        else:
            _LUT_CACHE[name] = _lut_inferno()
    return _LUT_CACHE[name]


def apply_colormap(gray: np.ndarray, cmap_name: str) -> np.ndarray:
    """uint8 HxW -> uint8 HxWx3"""
    name = (cmap_name or "inferno").lower().strip()
    if name == "gray":
        return np.stack([gray, gray, gray], axis=-1)
    lut = _colormap_lut(name)
    indices = np.clip(gray, 0, 255).astype(np.intp)
    return lut[indices]


