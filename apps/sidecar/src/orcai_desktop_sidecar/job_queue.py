"""Serial job scheduler (default concurrency = 1, priority queue)."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

_log = logging.getLogger(__name__)

StartFn = Callable[[str, str, dict[str, Any]], None]


@dataclass(order=True)
class _QueueItem:
    sort_key: tuple[int, float, float]
    job_id: str = field(compare=False)
    command: str = field(compare=False)
    params: dict[str, Any] = field(compare=False)
    start_fn: StartFn = field(compare=False)


class JobScheduler:
    """FIFO-by-priority queue; at most ``max_concurrent`` jobs running."""

    def __init__(self, max_concurrent: int = 1) -> None:
        self.max_concurrent = max(1, int(max_concurrent))
        self._cv = threading.Condition()
        self._pending: list[_QueueItem] = []
        self._running: set[str] = set()
        self._cancelled: set[str] = set()
        self._stop = False
        self._thread = threading.Thread(
            target=self._loop,
            name="orcai-job-scheduler",
            daemon=True,
        )
        self._thread.start()

    def stop(self, *, wait: bool = False, timeout: float = 2.0) -> None:
        """Wake the daemon loop so process shutdown can join without hanging."""
        with self._cv:
            self._stop = True
            self._cv.notify_all()
        if wait and self._thread.is_alive():
            self._thread.join(timeout=max(0.0, timeout))

    def submit(
        self,
        job_id: str,
        command: str,
        params: dict[str, Any],
        start_fn: StartFn,
        *,
        priority: int = 0,
        created_at: float | None = None,
    ) -> None:
        created = created_at if created_at is not None else time.time()
        # Higher priority first; then older jobs. Negate priority for ascending sort.
        item = _QueueItem(
            sort_key=(-int(priority), created, time.time()),
            job_id=job_id,
            command=command,
            params=params,
            start_fn=start_fn,
        )
        with self._cv:
            self._cancelled.discard(job_id)
            self._pending.append(item)
            self._pending.sort(key=lambda x: x.sort_key)
            self._cv.notify()

    def cancel_pending(self, job_id: str) -> bool:
        """Remove a not-yet-started job from the queue. Returns True if removed."""
        with self._cv:
            self._cancelled.add(job_id)
            before = len(self._pending)
            self._pending = [i for i in self._pending if i.job_id != job_id]
            removed = len(self._pending) < before
            self._cv.notify()
            return removed

    def notify_finished(self, job_id: str) -> None:
        with self._cv:
            self._running.discard(job_id)
            self._cancelled.discard(job_id)
            self._cv.notify()

    def set_max_concurrent(self, max_concurrent: int) -> None:
        """Live-update concurrency. Caps at 8."""
        with self._cv:
            self.max_concurrent = max(1, min(8, int(max_concurrent)))
            self._cv.notify_all()

    def snapshot(self) -> dict[str, Any]:
        with self._cv:
            return {
                "max_concurrent": self.max_concurrent,
                "running": sorted(self._running),
                "pending": [i.job_id for i in self._pending],
            }

    def _loop(self) -> None:
        while True:
            with self._cv:
                while (
                    not self._stop
                    and (
                        not self._pending
                        or len(self._running) >= self.max_concurrent
                    )
                ):
                    self._cv.wait()
                if self._stop and not self._pending:
                    return
                if not self._pending:
                    continue
                item = self._pending.pop(0)
                if item.job_id in self._cancelled:
                    self._cancelled.discard(item.job_id)
                    continue
                self._running.add(item.job_id)

            try:
                item.start_fn(item.job_id, item.command, item.params)
            except Exception as exc:  # noqa: BLE001 — start_fn must not kill scheduler loop
                _log.exception("job start failed for %s", item.job_id)
                try:
                    from orcai_desktop_sidecar.jobs import JobStatus, get_job, set_status

                    current = get_job(item.job_id)
                    if current is not None and current.status in (
                        JobStatus.PENDING,
                        JobStatus.RUNNING,
                    ):
                        set_status(
                            item.job_id,
                            JobStatus.FAILED,
                            error=f"Could not start worker: {exc}",
                            exit_code=1,
                        )
                except Exception:  # noqa: BLE001 — never break the scheduler
                    _log.exception(
                        "failed to mark job %s as FAILED after start error",
                        item.job_id,
                    )
                self.notify_finished(item.job_id)


_scheduler: JobScheduler | None = None
_scheduler_lock = threading.Lock()


def get_scheduler(max_concurrent: int = 1) -> JobScheduler:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is None:
            _scheduler = JobScheduler(max_concurrent=max_concurrent)
        return _scheduler


def stop_scheduler(*, wait: bool = False) -> None:
    with _scheduler_lock:
        sched = _scheduler
    if sched is not None:
        sched.stop(wait=wait)
