"""Colormap, normalization, and linear-STFT helpers for spectrogram tiles."""

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
        import librosa

        peak = float(np.max(x))
        if peak > 1e-12:
            x = librosa.amplitude_to_db(np.maximum(x, 0.0), ref=peak)
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


def spectrogram_view_sample_rate(
    orcai_parameter: dict,
    wav_sample_rate: float,
) -> float:
    """Working sample rate for tiles — at least 48 kHz (orcAI sampling_rate)."""
    sr = effective_sample_rate(orcai_parameter, float(wav_sample_rate))
    if sr < ORCAI_VIEW_SAMPLE_RATE_HZ:
        return ORCAI_VIEW_SAMPLE_RATE_HZ
    return sr


def spectrogram_axis_max_hz(
    wav_sample_rate: float,
    orcai_parameter: dict,
) -> float:
    """Fixed top frequency (Hz) for the linear viewer axis (orcAI freq_range)."""
    _sr = spectrogram_view_sample_rate(orcai_parameter, wav_sample_rate)
    return ORCAI_VIEW_FMAX_HZ


def frequency_energy_histogram(chunk: np.ndarray, bins: int = 18) -> list[float]:
    """Sum energy per frequency row (for contrast rail)."""
    if chunk.size == 0:
        return [0.0] * bins
    per_row = chunk.sum(axis=0)
    if per_row.size == 0:
        return [0.0] * bins
    if per_row.size >= bins:
        edges = np.linspace(0, per_row.size, bins + 1, dtype=int)
        out = []
        for i in range(bins):
            part = per_row[edges[i] : edges[i + 1]]
            out.append(float(part.sum()) if part.size else 0.0)
        return out
    padded = np.pad(per_row, (0, bins - per_row.size))
    return [float(x) for x in padded.tolist()]


def _crop_linear_chunk_to_fmax(
    chunk: np.ndarray,
    sample_rate: float,
    orcai_parameter: dict,
) -> np.ndarray:
    """Keep only frequency bins up to orcAI fmax (typically 16 kHz)."""
    if chunk.size == 0:
        return chunk
    import librosa

    _n_mels, _fmin, fmax = read_mel_params(orcai_parameter, sample_rate)
    n_fft, _hop = read_stft_params(orcai_parameter)
    freqs = librosa.fft_frequencies(sr=sample_rate, n_fft=n_fft)
    if freqs.size != chunk.shape[1]:
        return chunk
    mask = freqs <= fmax + 1e-6
    if mask.all():
        return chunk
    return chunk[:, mask]


def _pad_audio_to_window(
    y: np.ndarray,
    sample_rate: float,
    t0: float,
    t1: float,
) -> np.ndarray:
    """Pad or trim so STFT covers the full requested [t0, t1] window."""
    duration = max(t1 - t0, 0.01)
    sr = float(sample_rate or 8000.0)
    target = max(1, int(np.ceil(duration * sr)))
    if y.size < target:
        return np.pad(y, (0, target - y.size), mode="constant")
    if y.size > target:
        return np.asarray(y[:target], dtype=np.float32)
    return y


def stft_linear_slice(
    wav_path: str,
    *,
    t0: float,
    t1: float,
    channel: int,
    n_fft: int,
    hop_length: int,
    orcai_parameter: dict,
) -> np.ndarray:
    """Linear magnitude STFT for [t0, t1] only (time x frequency)."""
    import librosa

    duration = max(t1 - t0, 0.01)
    y, sr = librosa.load(
        wav_path,
        sr=None,
        mono=False,
        offset=t0,
        duration=duration,
    )
    if y.ndim > 1:
        idx = max(0, min(channel - 1, y.shape[0] - 1))
        y = y[idx]
    if y.size == 0:
        y = np.zeros(n_fft, dtype=np.float32)

    sr = float(sr or 8000.0)
    sr_eff = spectrogram_view_sample_rate(orcai_parameter, sr)
    if abs(sr_eff - sr) > 1.0:
        y = librosa.resample(y, orig_sr=sr, target_sr=sr_eff)
        sr = sr_eff

    y = _pad_audio_to_window(y, sr, t0, t1)

    n_fft = max(256, int(n_fft))
    hop_length = max(64, int(hop_length))
    spec = np.abs(
        librosa.stft(y, n_fft=n_fft, hop_length=hop_length, center=True),
    )
    chunk = np.asarray(spec.T, dtype=np.float32)
    return _crop_linear_chunk_to_fmax(chunk, sr, orcai_parameter)


def read_stft_params(orcai_parameter: dict) -> tuple[int, int]:
    """Return ``(n_fft, hop_length)``; defaults match orcAI (512 / 256)."""
    spec = spectrogram_parameter_section(orcai_parameter)
    n_fft = int(
        spec.get(
            "nfft",
            spec.get(
                "n_fft",
                spec.get("NFFT", orcai_parameter.get("n_fft", ORCAI_DEFAULT_NFFT)),
            ),
        ),
    )
    hop = int(
        spec.get(
            "n_overlap",
            spec.get(
                "hop_length",
                spec.get(
                    "hop",
                    spec.get(
                        "HOP",
                        orcai_parameter.get("hop_length", ORCAI_DEFAULT_HOP),
                    ),
                ),
            ),
        ),
    )
    return max(256, n_fft), max(64, hop)


def read_mel_params(orcai_parameter: dict, sample_rate: float) -> tuple[int, float, float]:
    """Mel filterbank settings aligned with orcAI parameter JSON."""
    spec = spectrogram_parameter_section(orcai_parameter)
    n_mels = int(
        spec.get("n_mels", spec.get("N_MELS", orcai_parameter.get("n_mels", 128))),
    )
    freq_range = spec.get("freq_range")
    if isinstance(freq_range, (list, tuple)) and len(freq_range) >= 2:
        fmin = float(freq_range[0])
        fmax = float(freq_range[1])
    else:
        fmin = float(spec.get("fmin", spec.get("f_min", 0.0)))
        fmax_raw = spec.get("fmax", spec.get("f_max"))
        fmax = float(fmax_raw) if fmax_raw is not None else ORCAI_VIEW_FMAX_HZ
    nyquist = float(sample_rate) / 2.0
    # Cap at orcAI model band (default freq_range upper = 16 kHz), not Nyquist.
    fmax = min(max(fmin + 1.0, fmax), nyquist, ORCAI_VIEW_FMAX_HZ)
    return max(16, n_mels), max(0.0, fmin), fmax


def effective_sample_rate(orcai_parameter: dict, wav_sample_rate: float) -> float:
    """Model / orcAI working sample rate when the WAV is resampled."""
    spec = spectrogram_parameter_section(orcai_parameter)
    for key in ("sample_rate", "sr", "SAMPLING_RATE", "sampling_rate"):
        if key in spec and spec[key] is not None:
            try:
                return float(spec[key])
            except (TypeError, ValueError):
                continue
    for key in ("sample_rate", "sr", "SAMPLING_RATE", "sampling_rate"):
        if key in orcai_parameter and orcai_parameter[key] is not None:
            try:
                return float(orcai_parameter[key])
            except (TypeError, ValueError):
                continue
    return float(wav_sample_rate)


def estimate_delta_t_sec(orcai_parameter: dict, wav_sample_rate: float) -> float:
    """Seconds per spectrogram time frame without loading the full recording."""
    _, hop = read_stft_params(orcai_parameter)
    sr = effective_sample_rate(orcai_parameter, wav_sample_rate)
    return hop / sr if sr > 0 else 0.0


def log_mel_slice(
    wav_path: str,
    *,
    t0: float,
    t1: float,
    channel: int,
    orcai_parameter: dict,
) -> np.ndarray:
    """Legacy log-mel tile helper (unused by the viewer; kept for experiments).

    Production tiles use ``display_kind=orcai`` → full-file ``make_spectrogram``
    (disk-cached float32 for re-open).
    """
    import librosa

    duration = max(t1 - t0, 0.01)
    y, sr = librosa.load(
        wav_path,
        sr=None,
        mono=False,
        offset=t0,
        duration=duration,
    )
    if y.ndim > 1:
        idx = max(0, min(channel - 1, y.shape[0] - 1))
        y = y[idx]
    if y.size == 0:
        n_mels, _, _ = read_mel_params(orcai_parameter, sr or 8000.0)
        return np.zeros((1, n_mels), dtype=np.float32)

    sr_eff = spectrogram_view_sample_rate(orcai_parameter, float(sr))
    if abs(sr_eff - float(sr)) > 1.0:
        y = librosa.resample(y, orig_sr=sr, target_sr=sr_eff)
        sr = sr_eff

    y = _pad_audio_to_window(y, float(sr), t0, t1)

    n_fft, hop = read_stft_params(orcai_parameter)
    n_mels, fmin, fmax = read_mel_params(orcai_parameter, sr)
    mel = librosa.feature.melspectrogram(
        y=y,
        sr=sr,
        n_fft=n_fft,
        hop_length=hop,
        n_mels=n_mels,
        fmin=fmin,
        fmax=fmax,
        power=2.0,
        center=True,
    )
    log_mel = librosa.power_to_db(mel, ref=np.max(mel) + 1e-10)
    return np.asarray(log_mel.T, dtype=np.float32)


def _linear_freq_centers_hz(
    n_bins: int,
    sample_rate: float,
    orcai_parameter: dict,
) -> np.ndarray:
    """FFT bin centers aligned with orcAI ``preprocess_spectrogram`` freq_range crop."""
    import librosa

    n_fft, _hop = read_stft_params(orcai_parameter)
    _n_mels, fmin, fmax = read_mel_params(orcai_parameter, sample_rate)
    sr = float(sample_rate)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    # Same indexing as orcai.spectrogram.preprocess_spectrogram.
    lo_hits = np.argwhere(freqs <= fmin)
    hi_hits = np.argwhere(freqs >= fmax)
    lo_idx = int(lo_hits[0][0]) if lo_hits.size else 0
    hi_idx = int(hi_hits[0][0]) if hi_hits.size else int(freqs.size)
    cropped = freqs[lo_idx:hi_idx]
    if cropped.size == n_bins:
        return np.asarray(cropped, dtype=np.float64)
    if cropped.size == 0:
        return np.linspace(fmin, min(fmax, sr / 2.0), max(1, n_bins), dtype=np.float64)
    return np.linspace(
        float(cropped[0]),
        float(cropped[-1]),
        max(1, n_bins),
        dtype=np.float64,
    )


def _mel_freq_edges_hz(
    n_bins: int,
    sample_rate: float,
    orcai_parameter: dict,
) -> np.ndarray:
    import librosa

    n_mels, fmin, fmax = read_mel_params(orcai_parameter, sample_rate)
    n_mels = max(n_bins, n_mels)
    return librosa.mel_frequencies(
        n_mels=n_mels + 1,
        fmin=fmin,
        fmax=fmax,
        sr=sample_rate,
    )


def estimate_tf_bounds_hz(
    chunk: np.ndarray,
    *,
    display_kind: str,
    sample_rate: float,
    orcai_parameter: dict,
    threshold_ratio: float = 0.45,
    min_bandwidth_hz: float = 60.0,
    max_span_fraction: float = 0.4,
) -> tuple[float | None, float | None]:
    """
    Estimate Hz bounds for a time slice from summed energy per frequency row.
    Used for TF overlay boxes / detections table when label files lack f0/f1.

    Uses the contiguous run of bins above ``threshold_ratio * peak`` that
    contains the peak bin — not first→last active bin (which balloons when
    low-frequency rumble and a whistle both exceed the threshold).

    Subtracts a median noise floor first (orcAI tiles are often [0,1] with a
    high floor). If the lobe still spans most of the axis, tightens the
    threshold; returns ``None`` when no credible narrow band is found.
    """
    del display_kind  # orcAI + linear tiles share linear STFT bin centers
    if chunk.size == 0:
        return None, None

    per_bin = np.asarray(chunk.sum(axis=0), dtype=np.float64)
    if per_bin.size == 0:
        return None, None

    floor = float(np.median(per_bin))
    signal = np.maximum(per_bin - floor, 0.0)
    peak = float(signal.max())
    if peak <= 1e-12:
        signal = per_bin
        peak = float(signal.max())
        if peak <= 0:
            return None, None

    centers = _linear_freq_centers_hz(per_bin.size, sample_rate, orcai_parameter)
    if centers.size == 0:
        return None, None
    axis_max = float(centers[-1]) if centers.size else 16_000.0
    if axis_max <= 0:
        axis_max = 16_000.0

    # Progressively tighter thresholds until the lobe is a credible band.
    ratios = sorted(
        {
            float(threshold_ratio),
            max(float(threshold_ratio), 0.55),
            0.7,
            0.85,
        }
    )
    peak_i = int(np.argmax(signal))
    best: tuple[float, float] | None = None

    for ratio in ratios:
        thr = peak * ratio
        if signal[peak_i] < thr:
            continue
        b0 = b1 = peak_i
        while b0 > 0 and signal[b0 - 1] >= thr:
            b0 -= 1
        while b1 < signal.size - 1 and signal[b1 + 1] >= thr:
            b1 += 1

        b1 = min(b1, centers.size - 1)
        b0 = min(b0, b1)
        hz_min = float(centers[b0])
        hz_max = float(centers[b1])
        if hz_max < hz_min:
            hz_min, hz_max = hz_max, hz_min

        if hz_max - hz_min < min_bandwidth_hz:
            mid = (hz_min + hz_max) / 2.0
            hz_min = max(0.0, mid - min_bandwidth_hz / 2.0)
            hz_max = mid + min_bandwidth_hz / 2.0

        span_frac = (hz_max - hz_min) / axis_max
        if span_frac <= max_span_fraction:
            return hz_min, hz_max
        # Keep the narrowest attempt as a last resort only if still moderately wide.
        if best is None or (hz_max - hz_min) < (best[1] - best[0]):
            best = (hz_min, hz_max)

    if best is not None and (best[1] - best[0]) / axis_max <= max_span_fraction * 1.25:
        return best
    return None, None
