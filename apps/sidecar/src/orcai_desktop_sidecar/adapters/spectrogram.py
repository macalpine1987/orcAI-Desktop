"""Spectrogram viewport tiles for the in-app viewer.

Public API is re-exported here. Metadata / histogram / waveform / tile helpers
live in sibling modules.
"""

from __future__ import annotations

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
from orcai_desktop_sidecar.adapters.spectrogram_meta import (
    _default_orcai_parameter,
    _parameter_cache_key,
    _read_orcai_parameter,
    _resolve_parameter_path,
    get_spectrogram_meta,
    get_wav_meta,
)
from orcai_desktop_sidecar.adapters.spectrogram_render import (
    normalize_display_kind,
    read_stft_params,
    stft_linear_slice,
)
from orcai_desktop_sidecar.adapters.spectrogram_tile import (
    _to_uint8_gray,
    render_spectrogram_tile_png,
)
from orcai_desktop_sidecar.adapters.spectrogram_waveform import render_waveform_png

# Singleflight: one make_spectrogram per cache key (tile + labels TF concurrent).
_build_locks_guard = threading.Lock()
_build_locks: dict[str, threading.Lock] = {}
_BUILD_LOCKS_MAX = 128
# Heavy WAVs: only one full-file STFT at a time (avoid dual builds thrashing RAM).
_full_build_gate = threading.Semaphore(1)


def _prune_build_locks_unlocked() -> None:
    """Drop idle locks when the dict grows past the soft cap."""
    if len(_build_locks) <= _BUILD_LOCKS_MAX:
        return
    for key, lock in list(_build_locks.items()):
        if len(_build_locks) <= _BUILD_LOCKS_MAX:
            return
        if not lock.acquire(blocking=False):
            continue
        try:
            _build_locks.pop(key, None)
        finally:
            lock.release()


def _build_lock_for(key: str) -> threading.Lock:
    with _build_locks_guard:
        lock = _build_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _build_locks[key] = lock
            _prune_build_locks_unlocked()
        return lock


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


def clear_spectrogram_cache() -> None:
    from orcai_desktop_sidecar.adapters.spectrogram_cache import (
        clear_disk_and_ram_cache,
    )

    clear_disk_and_ram_cache()


# Import after chunk loaders so histogram/tile lazy imports resolve.
from orcai_desktop_sidecar.adapters.spectrogram_histogram import (  # noqa: E402
    spectrogram_histogram,
)

__all__ = [
    "_default_orcai_parameter",
    "_load_orcai_spectrogram_chunk",
    "_load_power_chunk",
    "_parameter_cache_key",
    "_read_orcai_parameter",
    "_resolve_parameter_path",
    "_to_uint8_gray",
    "clear_spectrogram_cache",
    "ensure_orcai_spectrogram_cached",
    "get_spectrogram_meta",
    "get_wav_meta",
    "render_spectrogram_tile_png",
    "render_waveform_png",
    "spectrogram_histogram",
    "use_windowed_orcai_stft",
]
