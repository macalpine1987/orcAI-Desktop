"""Frequency-energy histogram for a spectrogram viewport."""

from __future__ import annotations

from typing import Any

from orcai_desktop_sidecar.adapters.spectrogram_meta import (
    _resolve_parameter_path,
    get_wav_meta,
)
from orcai_desktop_sidecar.adapters.spectrogram_render import (
    frequency_energy_histogram,
    normalize_display_kind,
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
    # Lazy import: chunk loader lives on the spectrogram façade (locks/cache).
    from orcai_desktop_sidecar.adapters.spectrogram import _load_power_chunk

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
