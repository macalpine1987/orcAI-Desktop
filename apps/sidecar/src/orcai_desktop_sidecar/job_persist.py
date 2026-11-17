"""SQLite load / merge helpers for the in-memory job registry."""

from __future__ import annotations

import logging
from typing import Any

from orcai_desktop_sidecar.job_logs import _trim_job_log
from orcai_desktop_sidecar.job_types import Job, JobStatus
from orcai_desktop_sidecar import store
from orcai_desktop_sidecar.store import (
    get_job_db,
    persist_job_everywhere,
    project_db_path_existing,
)

_log = logging.getLogger(__name__)

_ACTIVE_STATUSES = (JobStatus.RUNNING, JobStatus.PENDING)
_persist_fail_counts: dict[str, int] = {}


def job_to_dict(job: Job, *, include_log: bool = True) -> dict[str, Any]:
    """Serialize a job. List endpoints may omit log lines (keep ``log: []``).

    ``log_base`` stays the real ring-buffer base so clients can poll
    ``/v1/jobs/{id}/log`` / SSE from the retained tail.
    """
    return {
        "id": job.id,
        "command": job.command,
        "params": job.params,
        "status": job.status.value,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "started_at": job.started_at,
        "log": list(job.log) if include_log else [],
        "log_base": job.log_base,
        "result": job.result,
        "error": job.error,
        "command_line": job.command_line,
        "exit_code": job.exit_code,
        "progress": job.progress,
        "priority": job.priority,
        "artifacts": job.artifacts,
        "retry_of": job.retry_of,
    }


def _job_from_dict(data: dict[str, Any]) -> Job:
    started_raw = data.get("started_at")
    started_at: float | None = None
    if started_raw is not None:
        try:
            started_at = float(started_raw)
        except (TypeError, ValueError):
            started_at = None
    job = Job(
        id=data["id"],
        command=data["command"],
        params=data.get("params") or {},
        status=JobStatus(data["status"]),
        created_at=float(data["created_at"]),
        updated_at=float(data["updated_at"]),
        started_at=started_at,
        log=list(data.get("log") or []),
        log_base=max(0, int(data.get("log_base") or 0)),
        result=data.get("result"),
        error=data.get("error"),
        command_line=data.get("command_line"),
        exit_code=data.get("exit_code"),
        progress=data.get("progress"),
        priority=int(data.get("priority") or 0),
        artifacts=list(data.get("artifacts") or []),
        retry_of=data.get("retry_of"),
    )
    _trim_job_log(job)
    return job


def _persisted_cancelled(job: Job) -> bool:
    """True when app or project SQLite already stores this job as cancelled."""
    project_dir = (job.params.get("project_dir") if job.params else None) or None
    # Look up via ``store.db_session`` so tests that patch the store module bind.
    with store.db_session() as db:
        row = get_job_db(db, job.id)
        if row and str(row.get("status")) == JobStatus.CANCELLED.value:
            return True
    if project_dir:
        path = project_db_path_existing(project_dir)
        if path.is_file():
            with store.db_session(path) as db:
                row = get_job_db(db, job.id)
                if row and str(row.get("status")) == JobStatus.CANCELLED.value:
                    return True
    return False


def sync_persist(job: Job) -> None:
    # A worker still marked running must not overwrite a cancel the parent wrote.
    # A missing or unwritable project folder must not abort the in-memory job.
    try:
        if job.status != JobStatus.CANCELLED and _persisted_cancelled(job):
            return
        persist_job_everywhere(job_to_dict(job))
        _persist_fail_counts.pop(job.id, None)
    except Exception:  # noqa: BLE001 — persist is best-effort; keep in-memory job
        n = _persist_fail_counts.get(job.id, 0) + 1
        _persist_fail_counts[job.id] = n
        # First failure and every 20th thereafter — visible without flooding the log.
        if n == 1 or n % 20 == 0:
            _log.warning(
                "persist_job_everywhere failed for %s (count=%s)",
                job.id,
                n,
                exc_info=True,
            )
        else:
            _log.debug(
                "persist_job_everywhere failed for %s (count=%s)",
                job.id,
                n,
                exc_info=True,
            )


_sync_persist = sync_persist


def _prefer_job_copy(current: Job | None, candidate: Job) -> Job:
    """Pick a job copy. Cancelled wins over a newer running or pending row."""
    if current is None:
        return candidate
    if candidate.status == JobStatus.CANCELLED and current.status in _ACTIVE_STATUSES:
        return candidate
    if current.status == JobStatus.CANCELLED and candidate.status in _ACTIVE_STATUSES:
        return current
    if (
        candidate.status == JobStatus.CANCELLED
        and current.status == JobStatus.CANCELLED
    ):
        if candidate.updated_at >= current.updated_at:
            return candidate
        return current
    if candidate.updated_at > current.updated_at:
        return candidate
    return current
