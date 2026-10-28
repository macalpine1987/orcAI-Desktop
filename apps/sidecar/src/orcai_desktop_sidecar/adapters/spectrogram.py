"""Spectrogram metadata and viewport tiles for the in-app viewer."""

from __future__ import annotations

import io
import threading
from pathlib import Path
from typing import Any

import numpy as np

from orcai_desktop_sidecar.adapters.large_wav import use_windowed_orcai_stft
from orcai_desktop_sidecar.adapters.spectrogram_cache import (
    cache_key,
    has_full_spectrogram,
    load_full_spectrogram,
    save_full_spectrogram,
)

# Singleflight: one make_spectrogram per cache key (tile + labels TF concurrent).
_build_locks_guard = threading.Lock()
_build_locks: dict[str, threading.Lock] = {}
# Heavy WAVs: only one full-file STFT at a time (avoid dual builds thrashing RAM).
_full_build_gate = threading.Semaphore(1)


def _build_lock_for(key: str) -> threading.Lock:
    with _build_locks_guard:
        lock = _build_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _build_locks[key] = lock
        return lock

from orcai_desktop_sidecar.adapters.spectrogram_render import (
    apply_colormap,
    frequency_energy_histogram,
    normalize_display_kind,
    normalize_spectrogram_to_uint8,
    read_stft_params,
    stft_linear_slice,
)


def _default_orcai_parameter() -> dict[str, Any]:
    from importlib.resources import files

    from orcai.io import read_json

    return read_json(
        files("orcai.defaults").joinpath("default_orcai_parameter.json")
    )


def _read_orcai_parameter(orcai_parameter_path: str | Path | None) -> dict[str, Any]:
    """Load project/model parameter JSON, or fall back to orcAI defaults."""
    if orcai_parameter_path:
        from orcai.io import read_json

        from orcai_desktop_sidecar.paths import resolve_user_json_path

        try:
            return read_json(resolve_user_json_path(str(orcai_parameter_path)))
        except (FileNotFoundError, ValueError, PermissionError, OSError):
            pass
    return _default_orcai_parameter()


def _resolve_parameter_path(orcai_parameter: str | Path | None) -> str | None:
    if orcai_parameter is None:
        return None
    from orcai_desktop_sidecar.paths import resolve_user_json_path

    try:
        return str(resolve_user_json_path(str(orcai_parameter)))
    except (FileNotFoundError, ValueError, PermissionError, OSError):
        return None


# Back-compat alias used by unit tests / older call sites.
_parameter_cache_key = _resolve_parameter_path



def get_wav_meta(wav_path: str | Path) -> dict[str, Any]:
    from orcai_desktop_sidecar.wav_io import read_wav_meta

    meta = read_wav_meta(wav_path)
    return {
        "path": meta["path"],
        "duration_sec": meta["duration_sec"],
        "sample_rate": meta["sample_rate_hz"],
        "channels": meta["channels"],
        "bit_depth": meta.get("bit_depth"),
    }


def get_spectrogram_meta(
    wav_path: str | Path,
    orcai_parameter: str | Path | None = None,
) -> dict[str, Any]:
    """WAV metadata plus orcAI-aligned axis max frequency."""
    meta = get_wav_meta(wav_path)
    param = _read_orcai_parameter(_resolve_parameter_path(orcai_parameter))
    from orcai_desktop_sidecar.adapters.spectrogram_render import (
        ORCAI_VIEW_FMAX_HZ,
        spectrogram_parameter_section,
        spectrogram_view_sample_rate,
    )

    sr = float(meta["sample_rate"])
    meta["effective_sample_rate"] = spectrogram_view_sample_rate(param, sr)
    spec = spectrogram_parameter_section(param)
    freq_range = spec.get("freq_range")
    if isinstance(freq_range, (list, tuple)) and len(freq_range) >= 2:
        axis_max = float(freq_range[1])
    else:
        axis_max = ORCAI_VIEW_FMAX_HZ
    # Cap at model band default unless project asks for a lower ceiling.
    meta["axis_max_hz"] = min(max(1.0, axis_max), ORCAI_VIEW_FMAX_HZ)
    return meta


def _slice_time_range(
    times: np.ndarray,
    t0: float,
    t1: float,
) -> tuple[int, int]:
    if t1 <= t0:
        raise ValueError("t1 must be greater than t0")
    i0 = int(np.searchsorted(times, t0, side="left"))
    i1 = int(np.searchsorted(times, t1, side="right"))
    if i1 <= i0:
        i1 = min(i0 + 1, len(times))
    return i0, i1


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


def _build_full_spectrogram_to_disk(
    key: str,
    wav_path: str,
    *,
    channel: int,
    orcai_parameter: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray]:
    """Run upstream ``make_spectrogram`` and persist float32 matrix + times."""
    from orcai.auxiliary import Messenger
    from orcai.spectrogram import make_spectrogram

    with _full_build_gate:
        spectrogram, _, times = make_spectrogram(
            Path(wav_path),
            channel,
            orcai_parameter,
            msgr=Messenger(verbosity=0),
        )
        spec = np.asarray(spectrogram, dtype=np.float32)
        t = np.asarray(times, dtype=np.float64)
        save_full_spectrogram(
            key,
            spec,
            t,
            extra={
                "wav_path": str(Path(wav_path).resolve()),
                "channel": int(channel),
                "source": "make_spectrogram",
            },
        )
        return spec, t


def ensure_orcai_spectrogram_cached(
    wav_path: str,
    *,
    channel: int = 1,
    orcai_parameter: str | None = None,
    windowed: bool = False,
) -> dict[str, Any]:
    """Ensure disk+RAM cache holds the full orcAI matrix (no PNG encode).

    Used to warm adjacent WAVs while browsing Results so the next switch
    only slices + encodes a tile. Skipped when the long-WAV windowed path is on.
    """
    resolved = str(Path(wav_path).resolve())
    param_path = _resolve_parameter_path(orcai_parameter)
    param = _read_orcai_parameter(param_path)
    if use_windowed_orcai_stft(get_wav_meta(resolved)["duration_sec"], windowed):
        return {
            "status": "ready",
            "cache_key": None,
            "built": False,
            "skipped": True,
            "path": resolved,
        }
    key = cache_key(resolved, channel=int(channel), orcai_parameter=param)

    if has_full_spectrogram(key):
        cached = load_full_spectrogram(key)
        if cached is not None:
            return {
                "status": "ready",
                "cache_key": key,
                "built": False,
                "path": resolved,
            }

    with _build_lock_for(key):
        cached = load_full_spectrogram(key)
        if cached is not None:
            return {
                "status": "ready",
                "cache_key": key,
                "built": False,
                "path": resolved,
            }
        _build_full_spectrogram_to_disk(
            key,
            resolved,
            channel=int(channel),
            orcai_parameter=param,
        )
    return {
        "status": "ready",
        "cache_key": key,
        "built": True,
        "path": resolved,
    }


def _windowed_orcai_spectrogram_chunk(
    wav_path: str,
    *,
    t0: float,
    t1: float,
    channel: int,
    orcai_parameter: dict[str, Any],
) -> np.ndarray:
    """orcAI STFT of the viewport only (local quantiles). Does not persist a full npy."""
    from librosa import load as librosa_load
    from orcai.spectrogram import calculate_spectrogram, preprocess_spectrogram

    from orcai_desktop_sidecar.adapters.spectrogram_render import (
        spectrogram_parameter_section,
    )

    spec_p = spectrogram_parameter_section(orcai_parameter)
    sr = float(spec_p.get("sampling_rate", 48_000))
    nfft = int(spec_p.get("nfft", spec_p.get("n_fft", 512)))
    pad = nfft / sr if sr > 0 else 0.01
    duration = float(get_wav_meta(wav_path)["duration_sec"])
    load_t0 = max(0.0, float(t0) - pad)
    load_t1 = min(duration, float(t1) + pad)
    load_dur = max(load_t1 - load_t0, nfft / sr if sr > 0 else 0.05)
    y, _ = librosa_load(
        wav_path,
        sr=sr,
        offset=load_t0,
        duration=load_dur,
        mono=False,
    )
    spectrogram, frequencies, times = calculate_spectrogram(
        y,
        int(channel),
        spec_p,
    )
    spectrogram, _frequencies = preprocess_spectrogram(
        spectrogram, frequencies, spec_p
    )
    times = np.asarray(times, dtype=np.float64) + load_t0
    spec = np.asarray(spectrogram, dtype=np.float32)
    i0, i1 = _slice_time_range(times, t0, t1)
    return spec[i0:i1, :]


def _load_orcai_spectrogram_chunk(
    wav_path: str,
    *,
    t0: float,
    t1: float,
    channel: int,
    orcai_parameter_path: str | None,
    windowed: bool = False,
) -> np.ndarray:
    """Viewport slice of orcAI ``make_spectrogram``.

    Default: full-file matrix (exact global contrast) via disk/RAM cache.
    ``windowed`` + long WAV: viewport STFT only (local contrast).
    """
    resolved = str(Path(wav_path).resolve())
    param = _read_orcai_parameter(orcai_parameter_path)
    duration = float(get_wav_meta(resolved)["duration_sec"])
    if use_windowed_orcai_stft(duration, windowed):
        return _windowed_orcai_spectrogram_chunk(
            resolved,
            t0=t0,
            t1=t1,
            channel=channel,
            orcai_parameter=param,
        )
    key = cache_key(resolved, channel=channel, orcai_parameter=param)

    cached = load_full_spectrogram(key)
    if cached is None:
        with _build_lock_for(key):
            cached = load_full_spectrogram(key)
            if cached is None:
                cached = _build_full_spectrogram_to_disk(
                    key,
                    resolved,
                    channel=channel,
                    orcai_parameter=param,
                )
    spec, times = cached
    i0, i1 = _slice_time_range(times, t0, t1)
    return np.asarray(spec[i0:i1, :], dtype=np.float32)


def _load_power_chunk(
    wav_path: str,
    *,
    t0: float,
    t1: float,
    channel: int,
    orcai_parameter_path: str | None,
    display_kind: str,
    windowed: bool = False,
) -> np.ndarray:
    param = _read_orcai_parameter(orcai_parameter_path)
    kind = normalize_display_kind(display_kind)
    if kind == "linear":
        # Raw magnitude STFT path (not orcAI preprocess) — debug / alternate view.
        n_fft, hop = read_stft_params(param)
        return stft_linear_slice(
            wav_path,
            t0=t0,
            t1=t1,
            channel=channel,
            n_fft=n_fft,
            hop_length=hop,
            orcai_parameter=param,
        )

    return _load_orcai_spectrogram_chunk(
        wav_path,
        t0=t0,
        t1=t1,
        channel=channel,
        orcai_parameter_path=orcai_parameter_path,
        windowed=windowed,
    )


def spectrogram_histogram(
    wav_path: str,
    *,
    t0: float = 0.0,
    t1: float | None = None,
    channel: int = 1,
    orcai_parameter: str | None = None,
    display_kind: str = "orcai",
    bins: int = 18,
    windowed: bool = False,
) -> dict[str, Any]:
    meta = get_wav_meta(wav_path)
    duration = meta["duration_sec"]
    if t1 is None:
        t1 = duration
    t0 = max(0.0, t0)
    t1 = min(duration, t1)
    if t1 <= t0:
        t1 = min(duration, t0 + 1.0)

    param_path = _resolve_parameter_path(orcai_parameter)
    kind = normalize_display_kind(display_kind)
    chunk = _load_power_chunk(
        wav_path,
        t0=t0,
        t1=t1,
        channel=channel,
        orcai_parameter_path=param_path,
        display_kind=kind,
        windowed=windowed,
    )
    values = frequency_energy_histogram(chunk, bins=bins)
    return {
        "bins": values,
        "t0": t0,
        "t1": t1,
        "display_kind": kind,
    }


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
    meta = get_wav_meta(wav_path)
    duration = meta["duration_sec"]
    if t1 is None:
        t1 = duration
    t0 = max(0.0, t0)
    t1 = min(duration, t1)
    if t1 <= t0:
        t1 = min(duration, t0 + 1.0)

    width = max(64, min(width, 4096))
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
    if cmap_name == "gray":
        rgb = np.stack([raster, raster, raster], axis=-1)
    else:
        rgb = apply_colormap(raster, cmap_name)

    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()


def render_waveform_png(
    wav_path: str,
    *,
    t0: float = 0.0,
    t1: float | None = None,
    width: int = 800,
    height: int = 48,
    channel: int = 1,
) -> bytes:
    import librosa
    from PIL import Image, ImageDraw

    path = Path(wav_path)
    meta = get_wav_meta(path)
    duration = meta["duration_sec"]
    if t1 is None:
        t1 = duration
    t0 = max(0.0, t0)
    t1 = min(duration, t1)

    width = max(64, min(width, 4096))
    height = max(16, min(height, 256))

    y, _sr = librosa.load(
        path,
        sr=None,
        mono=False,
        offset=t0,
        duration=max(t1 - t0, 0.01),
    )
    if y.ndim > 1:
        idx = max(0, min(channel - 1, y.shape[0] - 1))
        y = y[idx]
    if y.size == 0:
        y = np.zeros(2, dtype=np.float32)

    step = max(1, len(y) // width)
    env = np.array(
        [np.max(np.abs(y[i : i + step])) for i in range(0, len(y), step)],
        dtype=np.float32,
    )
    if env.size < width:
        env = np.pad(env, (0, width - env.size))

    img = Image.new("L", (width, height), 235)
    draw = ImageDraw.Draw(img)
    mid = height // 2
    scale = (height / 2 - 2) / (float(env.max()) + 1e-8)
    for x, amp in enumerate(env[:width]):
        h = int(amp * scale)
        draw.line([(x, mid - h), (x, mid + h)], fill=0)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def clear_spectrogram_cache() -> None:
    from orcai_desktop_sidecar.adapters.spectrogram_cache import (
        clear_disk_and_ram_cache,
    )

    clear_disk_and_ram_cache()
