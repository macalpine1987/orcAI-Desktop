"""Process-wide sidecar runtime state shared by route modules."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeVar

# Tile warm/pan prefetch shares this pool; 4 keeps Analysis snappy without
# saturating CPU on long make_spectrogram builds.
spec_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="orcai-spec")
# Serialize in-process jobs that rewrite recording_table.csv / project files.
inprocess_job_lock = threading.Lock()
SECTION_CACHE_SEC = 4.0
SECTION_CACHE_MAX_KEYS = 64
summary_cache: dict[str, tuple[float, dict[str, Any]]] = {}
summary_cache_lock = threading.Lock()
results_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}
results_cache_lock = threading.Lock()

_T = TypeVar("_T")


class _SectionInflight:
    __slots__ = ("event", "result", "error")

    def __init__(self) -> None:
        self.event = threading.Event()
        self.result: Any = None
        self.error: BaseException | None = None


# Singleflight slots keyed by (id(cache), key) so summary/results/pipeline
# share the helper without colliding across dicts.
_section_inflight: dict[tuple[int, Any], _SectionInflight] = {}
_section_inflight_gate = threading.Lock()


def trim_section_cache(cache: dict[Any, Any], *, max_keys: int = SECTION_CACHE_MAX_KEYS) -> None:
    """Drop oldest entries when a section cache grows past ``max_keys`` (soft cap)."""
    overflow = len(cache) - max_keys
    if overflow <= 0:
        return
    # Values are (written_at monotonic, payload); drop oldest first.
    for key, _ in sorted(cache.items(), key=lambda item: item[1][0])[:overflow]:
        cache.pop(key, None)


# Compat alias
_trim_section_cache = trim_section_cache


def section_cache_get_or_build(
    cache: dict[Any, Any],
    key: Any,
    builder: Callable[[], _T],
    *,
    lock: threading.Lock,
    ttl: float = SECTION_CACHE_SEC,
    fresh: bool = False,
    now: float | None = None,
    max_keys: int = SECTION_CACHE_MAX_KEYS,
) -> _T:
    """Return a TTL-cached payload, sharing one ``builder`` across concurrent misses.

    ``fresh=True`` skips the hit path and rebuilds (still singleflighted for the
    same key). Failures are not stored, so a previous snapshot stays in place.
    """
    stamp = time.monotonic() if now is None else now
    if not fresh:
        with lock:
            hit = cache.get(key)
            if hit is not None and stamp - hit[0] < ttl:
                return hit[1]  # type: ignore[no-any-return]

    flight_key = (id(cache), key)
    with _section_inflight_gate:
        entry = _section_inflight.get(flight_key)
        if entry is None:
            entry = _SectionInflight()
            _section_inflight[flight_key] = entry
            leader = True
        else:
            leader = False

    if not leader:
        entry.event.wait()
        if entry.error is not None:
            raise entry.error
        return entry.result  # type: ignore[no-any-return]

    try:
        if not fresh:
            recheck = time.monotonic() if now is None else now
            with lock:
                hit = cache.get(key)
                if hit is not None and recheck - hit[0] < ttl:
                    entry.result = hit[1]
                    return hit[1]  # type: ignore[no-any-return]

        payload = builder()
        written_at = time.monotonic() if now is None else now
        with lock:
            cache[key] = (written_at, payload)
            trim_section_cache(cache, max_keys=max_keys)
        entry.result = payload
        return payload
    except BaseException as exc:
        entry.error = exc
        raise
    finally:
        with _section_inflight_gate:
            if _section_inflight.get(flight_key) is entry:
                del _section_inflight[flight_key]
        entry.event.set()


def put_summary_cache(key: str, payload: dict[str, Any]) -> None:
    with summary_cache_lock:
        summary_cache[key] = (time.monotonic(), payload)
        trim_section_cache(summary_cache)


def put_results_cache(key: tuple[str, str], payload: dict[str, Any]) -> None:
    with results_cache_lock:
        results_cache[key] = (time.monotonic(), payload)
        trim_section_cache(results_cache)

ALL_COMMANDS = [
    "init",
    "create-recording-table",
    "predict",
    "filter-predictions",
    "create-spectrograms",
    "create-label-arrays",
    "create-snippet-table",
    "create-tvt-snippet-tables",
    "create-tvt-data",
    "hpsearch",
    "train",
    "test",
]
