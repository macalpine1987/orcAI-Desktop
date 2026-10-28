"""Batch time windows for spectrogram-based TF bound estimation."""

from __future__ import annotations

from typing import Any

import numpy as np

_MAX_TF_SEGMENTS = 2000
_MAX_LOAD_WINDOWS = 80
_MAX_WINDOW_SEC = 45.0
_MAX_GAP_SEC = 3.0
_MAX_WARNINGS = 3


def _segment_start_sec(seg: dict[str, Any]) -> float:
    if "start_sec" in seg:
        return float(seg["start_sec"])
    return float(seg["start"])


def _segment_stop_sec(seg: dict[str, Any]) -> float:
    if "stop_sec" in seg:
        return float(seg["stop_sec"])
    return float(seg["stop"])


def segment_time_bounds(
    seg: dict[str, Any],
    duration_sec: float,
) -> tuple[float, float]:
    t0 = _segment_start_sec(seg)
    t1 = _segment_stop_sec(seg)
    t0 = max(0.0, min(t0, duration_sec))
    t1 = max(t0 + 0.02, min(t1, duration_sec))
    return t0, t1


def merge_load_windows(
    segments: list[dict[str, Any]],
    duration_sec: float,
    *,
    max_window_sec: float = _MAX_WINDOW_SEC,
    max_gap_sec: float = _MAX_GAP_SEC,
    max_windows: int = _MAX_LOAD_WINDOWS,
) -> list[tuple[float, float, list[dict[str, Any]]]]:
    """
    Group segments into a limited number of [t0, t1] loads for spectrogram slices.
    """
    if not segments:
        return []

    ordered = sorted(segments, key=_segment_start_sec)
    windows: list[tuple[float, float, list[dict[str, Any]]]] = []
    cur_t0 = 0.0
    cur_t1 = 0.0
    cur_segs: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal cur_t0, cur_t1, cur_segs
        if cur_segs:
            windows.append((cur_t0, cur_t1, cur_segs))
        cur_segs = []

    for seg in ordered:
        t0, t1 = segment_time_bounds(seg, duration_sec)
        if not cur_segs:
            cur_t0, cur_t1, cur_segs = t0, t1, [seg]
            continue
        gap = t0 - cur_t1
        merged_end = max(cur_t1, t1)
        span = merged_end - cur_t0
        if gap <= max_gap_sec and span <= max_window_sec:
            cur_t1 = merged_end
            cur_segs.append(seg)
        else:
            flush()
            cur_t0, cur_t1, cur_segs = t0, t1, [seg]

    flush()

    while len(windows) > max_windows:
        # Merge closest adjacent windows until under cap.
        best_i = 0
        best_gap = float("inf")
        for i in range(len(windows) - 1):
            gap = windows[i + 1][0] - windows[i][1]
            if gap < best_gap:
                best_gap = gap
                best_i = i
        a0, a1, a_segs = windows[best_i]
        _b0, b1, b_segs = windows[best_i + 1]
        merged = (
            a0,
            max(a1, b1),
            a_segs + b_segs,
        )
        windows = [*windows[:best_i], merged, *windows[best_i + 2 :]]

    return windows


def slice_chunk_for_segment(
    chunk: np.ndarray,
    window_t0: float,
    window_t1: float,
    seg_t0: float,
    seg_t1: float,
) -> np.ndarray:
    """Extract rows of a time x frequency chunk for one segment."""
    if chunk.size == 0:
        return chunk
    n_rows = chunk.shape[0]
    if n_rows <= 1:
        return chunk
    span = max(window_t1 - window_t0, 1e-6)
    rel0 = (seg_t0 - window_t0) / span
    rel1 = (seg_t1 - window_t0) / span
    i0 = int(np.floor(rel0 * n_rows))
    i1 = int(np.ceil(rel1 * n_rows))
    i1 = max(i0 + 1, min(i1, n_rows))
    return chunk[i0:i1, :]
