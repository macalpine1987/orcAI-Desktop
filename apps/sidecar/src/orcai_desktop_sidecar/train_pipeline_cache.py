"""Short-lived memo for pipeline board snapshots."""
from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any, TypeVar

from orcai_desktop_sidecar.runtime_state import section_cache_get_or_build

_PIPELINE_CACHE_SEC = 4.0
_PIPELINE_CACHE_MAX_KEYS = 64
PIPELINE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_pipeline_cache = PIPELINE_CACHE
_pipeline_cache_lock = threading.Lock()

_T = TypeVar("_T")


def _store_pipeline_cache(project_id: str, payload: dict[str, Any]) -> None:
    with _pipeline_cache_lock:
        _pipeline_cache[project_id] = (time.monotonic(), payload)
        if len(_pipeline_cache) <= _PIPELINE_CACHE_MAX_KEYS:
            return
        # Drop oldest by stamp (stable enough; values are (monotonic, payload)).
        ordered = sorted(_pipeline_cache.items(), key=lambda kv: kv[1][0])
        for key, _ in ordered[: len(_pipeline_cache) - _PIPELINE_CACHE_MAX_KEYS]:
            if key == project_id:
                continue
            _pipeline_cache.pop(key, None)


def store_pipeline_cache(project_id: str, payload: dict[str, Any]) -> None:
    _store_pipeline_cache(project_id, payload)


def get_cached_pipeline(project_id: str, *, fresh: bool, now: float | None = None) -> dict[str, Any] | None:
    if fresh:
        return None
    stamp = time.monotonic() if now is None else now
    with _pipeline_cache_lock:
        hit = _pipeline_cache.get(project_id)
        if hit is not None and stamp - hit[0] < _PIPELINE_CACHE_SEC:
            return hit[1]
    return None


def get_or_build_pipeline(
    project_id: str,
    builder: Callable[[], _T],
    *,
    fresh: bool = False,
    now: float | None = None,
) -> _T:
    """Singleflight wrapper around the pipeline board cache."""
    return section_cache_get_or_build(
        _pipeline_cache,
        project_id,
        builder,
        lock=_pipeline_cache_lock,
        ttl=_PIPELINE_CACHE_SEC,
        fresh=fresh,
        now=now,
        max_keys=_PIPELINE_CACHE_MAX_KEYS,
    )
