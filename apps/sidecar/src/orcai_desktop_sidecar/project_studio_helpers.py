"""Shared project_studio helpers (JSON / dir stats / parameter calls)."""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
from typing import Any

DEFAULT_SAMPLING_RATE_HZ = 48_000

_FALLBACK_PARAMETER_DEFAULTS: dict[str, Any] = {
    "name": "orcai-v1",
    "architecture": "ResNetLSTM",
    "model": {},
    "spectrogram": {
        "sampling_rate": DEFAULT_SAMPLING_RATE_HZ,
        "nfft": 512,
        "n_overlap": 256,
        "freq_range": [0, 16000],
        "quantiles": [0.01, 0.999],
    },
}


def read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


# Back-compat alias for modules that still import the private name.
_read_json_file = read_json_file


def orcai_parameter_defaults() -> dict[str, Any]:
    """Default parameter document shipped with orcAI (fallback when not installed)."""
    with contextlib.suppress(Exception):
        from importlib.resources import files

        resource = files("orcai.defaults").joinpath("default_orcai_parameter.json")
        data = json.loads(resource.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    return json.loads(json.dumps(_FALLBACK_PARAMETER_DEFAULTS))


def _parameter_calls(parameter: dict[str, Any] | None) -> list[str]:
    if not parameter:
        return []
    calls = parameter.get("calls")
    if not isinstance(calls, list):
        return []
    return [str(c) for c in calls]


def _parameter_sampling_rate(parameter: dict[str, Any] | None) -> int:
    if not parameter:
        return DEFAULT_SAMPLING_RATE_HZ
    spec = parameter.get("spectrogram")
    if isinstance(spec, dict):
        try:
            value = int(spec.get("sampling_rate") or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return DEFAULT_SAMPLING_RATE_HZ


def is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


_is_hidden = is_hidden


def _truthy_cell(value: str | None) -> bool | None:
    """Recording-table class cell: empty → masked (None); otherwise truthiness."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "<na>", "none"}:
        return None
    return text.lower() not in {"0", "false", "no"}


def dir_stats(path: Path) -> tuple[int, int, float | None]:
    files = 0
    size = 0
    newest: float | None = None
    for entry in path.rglob("*"):
        if not entry.is_file() or is_hidden(entry.relative_to(path)):
            continue
        stat = entry.stat()
        files += 1
        size += stat.st_size
        newest = stat.st_mtime if newest is None else max(newest, stat.st_mtime)
    return files, size, newest


_dir_stats = dir_stats
