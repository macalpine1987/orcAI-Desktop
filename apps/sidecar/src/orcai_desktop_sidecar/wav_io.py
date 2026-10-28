"""WAV validation and metadata for project recordings."""

from __future__ import annotations

from pathlib import Path
from typing import Any

MAX_SAMPLE_RATE_HZ = 500_000
MIN_BIT_DEPTH = 16
MAX_BIT_DEPTH = 32

WAV_SUFFIX = ".wav"
IMPORT_AUDIO_SUFFIXES = frozenset({WAV_SUFFIX})


def bit_depth_from_subtype(subtype: str | None) -> int | None:
    if not subtype:
        return None
    upper = subtype.upper()
    if upper in {"PCM_S8", "PCM_U8"}:
        return 8
    if "PCM_16" in upper:
        return 16
    if "PCM_24" in upper:
        return 24
    if "PCM_20" in upper:
        return 20
    if "PCM_32" in upper:
        return 32
    if "FLOAT" in upper or "DOUBLE" in upper:
        return None
    return None


def read_wav_meta(path: str | Path) -> dict[str, Any]:
    import soundfile as sf

    p = Path(path).resolve()
    if not p.is_file():
        raise FileNotFoundError(f"WAV not found: {p}")
    if p.suffix.lower() != WAV_SUFFIX:
        raise ValueError(f"Not a WAV file: {p}")

    info = sf.info(p)
    sr = int(info.samplerate)
    bit_depth = bit_depth_from_subtype(info.subtype)
    duration = float(info.frames) / float(sr) if sr else 0.0
    return {
        "path": str(p),
        "duration_sec": duration,
        "sample_rate_hz": sr,
        "bit_depth": bit_depth,
        "channels": int(info.channels),
        "subtype": info.subtype,
    }


def validate_wav_for_project(path: str | Path) -> dict[str, Any]:
    meta = read_wav_meta(path)
    sr = meta["sample_rate_hz"]
    depth = meta["bit_depth"]

    if sr <= 0 or sr > MAX_SAMPLE_RATE_HZ:
        raise ValueError(
            f"Sample rate {sr} Hz is not supported (max {MAX_SAMPLE_RATE_HZ // 1000} kHz)"
        )
    subtype = (meta.get("subtype") or "").upper()
    if "FLOAT" in subtype or "DOUBLE" in subtype:
        raise ValueError(
            f"Floating-point WAV ({meta.get('subtype')}) is not supported; "
            f"use {MIN_BIT_DEPTH}–{MAX_BIT_DEPTH}-bit PCM"
        )
    if depth is None:
        raise ValueError(
            f"Unsupported WAV format ({meta.get('subtype') or 'unknown'}); "
            f"use {MIN_BIT_DEPTH}–{MAX_BIT_DEPTH}-bit PCM"
        )
    if depth < MIN_BIT_DEPTH or depth > MAX_BIT_DEPTH:
        raise ValueError(
            f"Bit depth {depth} is not supported (allowed {MIN_BIT_DEPTH}–{MAX_BIT_DEPTH} bit)"
        )
    return meta


def audio_import_kind(path: str | Path) -> str | None:
    """Return ``wav`` when the path is a supported import type."""
    if Path(path).suffix.lower() == WAV_SUFFIX:
        return "wav"
    return None
