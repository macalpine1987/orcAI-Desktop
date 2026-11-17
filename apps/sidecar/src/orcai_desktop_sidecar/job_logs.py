"""In-memory job log ring buffer and batched SQLite flush."""

from __future__ import annotations

import threading

from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import Job, _TERMINAL_STATUSES

# Batch log persistence — avoid full SQLite rewrite on every print line.
_LOG_FLUSH_INTERVAL_SEC = 0.35
_log_dirty: set[str] = set()
_log_flush_timer: threading.Timer | None = None

# Bound in-memory + persisted log per job (verbose train at -v 2/3).
# Absolute indices keep growing via log_base; only the tail is retained.
JOB_LOG_MAX_LINES = 8000
# After a job finishes, keep a shorter in-memory tail (SQLite still has history).
JOB_LOG_TERMINAL_MAX_LINES = 500
# Soft cap on finished jobs retained in the process map (active jobs never evicted).
JOBS_MAX_TERMINAL_IN_MEMORY = 200


def _trim_job_log(job: Job, *, max_lines: int | None = None) -> None:
    """Keep the last max_lines; bump log_base for dropped prefix."""
    limit = JOB_LOG_MAX_LINES if max_lines is None else max_lines
    overflow = len(job.log) - limit
    if overflow <= 0:
        return
    del job.log[:overflow]
    job.log_base += overflow


def _evict_terminal_jobs_unlocked(*, keep_id: str | None = None) -> None:
    """Drop oldest terminal jobs from RAM when over the soft cap."""
    terminal = [
        job
        for job in JOBS_REGISTRY.values()
        if job.status in _TERMINAL_STATUSES and job.id != keep_id
    ]
    # Count includes the kept job still in the map.
    total_terminal = sum(
        1 for job in JOBS_REGISTRY.values() if job.status in _TERMINAL_STATUSES
    )
    overflow = total_terminal - JOBS_MAX_TERMINAL_IN_MEMORY
    if overflow <= 0:
        return
    terminal.sort(key=lambda job: job.updated_at)
    for job in terminal[:overflow]:
        JOBS_REGISTRY.pop(job.id, None)
        _log_dirty.discard(job.id)


def _push_log_line(job: Job, line: str) -> int:
    """Append one line, trim if needed, return absolute index."""
    job.log.append(line)
    abs_index = job.log_base + len(job.log) - 1
    _trim_job_log(job)
    return abs_index


def job_log_abs_len(job: Job) -> int:
    return job.log_base + len(job.log)


def _flush_dirty_logs() -> None:
    global _log_flush_timer
    from orcai_desktop_sidecar.job_persist import sync_persist

    with JOBS_LOCK:
        _log_flush_timer = None
        dirty = list(_log_dirty)
        _log_dirty.clear()
        jobs = [(JOBS_REGISTRY[jid],) for jid in dirty if jid in JOBS_REGISTRY]
    for (job,) in jobs:
        sync_persist(job)


def _schedule_log_flush(job_id: str) -> None:
    global _log_flush_timer
    with JOBS_LOCK:
        _log_dirty.add(job_id)
        if _log_flush_timer is not None:
            return
        timer = threading.Timer(_LOG_FLUSH_INTERVAL_SEC, _flush_dirty_logs)
        timer.daemon = True
        _log_flush_timer = timer
        timer.start()


def stop_log_flush_timer() -> None:
    """Cancel the pending log-flush timer and flush any dirty rows (shutdown)."""
    global _log_flush_timer
    with JOBS_LOCK:
        timer = _log_flush_timer
        _log_flush_timer = None
    if timer is not None:
        timer.cancel()
    _flush_dirty_logs()
