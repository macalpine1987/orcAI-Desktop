"""STFT / axis / parameter helpers for spectrogram tiles."""

from __future__ import annotations

import numpy as np

from orcai_desktop_sidecar.adapters.spectrogram_render_color import (
    ORCAI_DEFAULT_HOP,
    ORCAI_DEFAULT_NFFT,
    ORCAI_VIEW_FMAX_HZ,
    ORCAI_VIEW_SAMPLE_RATE_HZ,
    spectrogram_parameter_section,
)

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
