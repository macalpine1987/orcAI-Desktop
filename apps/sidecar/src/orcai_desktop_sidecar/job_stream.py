"""In-process pub/sub for job log / progress streaming."""

from __future__ import annotations

import queue
import threading
import time
from typing import Any

_lock = threading.Lock()
_subs: dict[str, list[queue.Queue[dict[str, Any] | None]]] = {}

# Large enough for verbose train logs; overflow drops oldest non-status events.
_DEFAULT_MAXSIZE = 8192


def publish(job_id: str, event: dict[str, Any]) -> None:
    payload = {**event, "job_id": job_id, "ts": time.time()}
    with _lock:
        waiters = list(_subs.get(job_id, ()))
    for q in waiters:
        _enqueue(q, payload)


def _enqueue(q: queue.Queue[dict[str, Any] | None], payload: dict[str, Any]) -> None:
    try:
        q.put_nowait(payload)
        return
    except queue.Full:
        pass
    # Prefer keeping terminal status events: drop oldest until space.
    for _ in range(q.maxsize or 1):
        try:
            dropped = q.get_nowait()
        except queue.Empty:
            break
        if isinstance(dropped, dict) and dropped.get("type") == "status":
            # Re-queue status and try again once.
            try:
                q.put_nowait(dropped)
            except queue.Full:
                pass
            break
    try:
        q.put_nowait(payload)
    except queue.Full:
        # Last resort: still try to deliver status.
        if payload.get("type") == "status":
            try:
                while True:
                    q.get_nowait()
            except queue.Empty:
                pass
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass


def subscribe(
    job_id: str, *, maxsize: int = _DEFAULT_MAXSIZE
) -> queue.Queue[dict[str, Any] | None]:
    q: queue.Queue[dict[str, Any] | None] = queue.Queue(maxsize=maxsize)
    with _lock:
        _subs.setdefault(job_id, []).append(q)
    return q


def unsubscribe(job_id: str, q: queue.Queue[dict[str, Any] | None]) -> None:
    with _lock:
        waiters = _subs.get(job_id)
        if not waiters:
            return
        try:
            waiters.remove(q)
        except ValueError:
            pass
        if not waiters:
            _subs.pop(job_id, None)
