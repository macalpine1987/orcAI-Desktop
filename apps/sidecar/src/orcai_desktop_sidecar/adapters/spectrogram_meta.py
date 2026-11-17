"""WAV / spectrogram axis metadata and orcAI parameter helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any


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
