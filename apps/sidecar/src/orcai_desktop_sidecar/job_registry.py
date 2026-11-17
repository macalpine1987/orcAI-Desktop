"""In-memory job registry: bootstrap, create, get, list, log/progress/status."""

from __future__ import annotations

import time
import uuid
from typing import Any

from orcai_desktop_sidecar.cli_command import build_command_line
from orcai_desktop_sidecar.job_cancel import register as register_job_cancel
from orcai_desktop_sidecar.job_logs import (
    JOB_LOG_TERMINAL_MAX_LINES,
    _evict_terminal_jobs_unlocked,
    _flush_dirty_logs,
    _log_dirty,
    _push_log_line,
    _schedule_log_flush,
    _trim_job_log,
)
from orcai_desktop_sidecar.job_persist import (
    _job_from_dict,
    _prefer_job_copy,
    sync_persist,
)
from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import Job, JobStatus, _TERMINAL_STATUSES
from orcai_desktop_sidecar.store import (
    get_job_db,
    list_all_jobs,
    project_db_path_existing,
)


def _jobs_mod():
    """Access the jobs façade so tests can reset ``jobs._bootstrapped``."""
    from orcai_desktop_sidecar import jobs as jobs_mod

    return jobs_mod


def bootstrap_jobs() -> None:
    jobs_mod = _jobs_mod()
    with JOBS_LOCK:
        if jobs_mod._bootstrapped:
            return
        for row in list_all_jobs(limit=500):
            JOBS_REGISTRY[row["id"]] = _job_from_dict(row)
        jobs_mod._bootstrapped = True


def cancel_jobs_on_shutdown() -> int:
    """Stop queued and running tasks because this sidecar process is exiting.

    Called from Quit / Stop before the process is killed, and again when a new
    sidecar process starts: the in-memory queue is empty, so a leftover
    pending row would stay «в очереди» and never run. A job worker must not
    call this. It only loads the row it is about to execute.
    Pending jobs are cancelled before running ones so the scheduler cannot
    start the next task while the current worker is being stopped.
    Finished rows are left as they are. A second call cancels nothing.
    """
    from orcai_desktop_sidecar.jobs import cancel_job, get_job

    bootstrap_jobs()
    with JOBS_LOCK:
        pending = [
            job.id for job in JOBS_REGISTRY.values() if job.status == JobStatus.PENDING
        ]
        running = [
            job.id for job in JOBS_REGISTRY.values() if job.status == JobStatus.RUNNING
        ]
    cancelled = 0
    for job_id in (*pending, *running):
        job = get_job(job_id)
        if job is None or job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
            continue
        cancel_job(job_id, cascade_plan=False)
        cancelled += 1
    return cancelled


def create_job(
    command: str,
    params: dict[str, Any] | None = None,
    *,
    priority: int = 0,
    retry_of: str | None = None,
) -> Job:
    bootstrap_jobs()
    params = dict(params or {})
    if command in ("test", "train", "hpsearch"):
        from orcai_desktop_sidecar.tvt_compression import align_dataset_compression

        params = align_dataset_compression(params)
    job = Job(
        id=str(uuid.uuid4()),
        command=command,
        params=params,
        priority=int(priority),
        retry_of=retry_of,
        command_line=build_command_line(command, params),
    )
    register_job_cancel(job.id)
    with JOBS_LOCK:
        JOBS_REGISTRY[job.id] = job
    sync_persist(job)
    return job


def get_job(job_id: str) -> Job | None:
    """Return job state. A cancelled copy beats a newer running or pending one."""
    # Use jobs.db_session so tests can patch the façade binding.
    jobs_mod = _jobs_mod()
    db_session = jobs_mod.db_session

    bootstrap_jobs()
    with JOBS_LOCK:
        mem = JOBS_REGISTRY.get(job_id)
        project_dir = (mem.params.get("project_dir") if mem else None) or None

    latest: Job | None = mem
    with db_session() as db:
        row = get_job_db(db, job_id)
        if row:
            latest = _prefer_job_copy(latest, _job_from_dict(row))
    if project_dir:
        path = project_db_path_existing(project_dir)
        if path.is_file():
            with db_session(path) as db:
                row = get_job_db(db, job_id)
                if row:
                    latest = _prefer_job_copy(latest, _job_from_dict(row))

    if latest:
        with JOBS_LOCK:
            JOBS_REGISTRY[job_id] = latest
    return latest


def list_jobs(project_dir: str | None = None) -> list[Job]:
    bootstrap_jobs()
    rows = list_all_jobs(project_dir=project_dir, limit=200)
    jobs = [_job_from_dict(row) for row in rows]
    chosen: list[Job] = []
    with JOBS_LOCK:
        for job in jobs:
            kept = _prefer_job_copy(JOBS_REGISTRY.get(job.id), job) or job
            JOBS_REGISTRY[job.id] = kept
            chosen.append(kept)
    return chosen


def append_log(job_id: str, line: str) -> None:
    bootstrap_jobs()
    job: Job | None = None
    index = -1
    with JOBS_LOCK:
        job = JOBS_REGISTRY.get(job_id)
        if job:
            index = _push_log_line(job, line)
            job.updated_at = time.time()
    if job:
        _schedule_log_flush(job_id)
        from orcai_desktop_sidecar.job_stream import publish

        publish(
            job_id,
            {
                "type": "log",
                "line": line,
                "index": index,
                "progress": job.progress,
                "status": job.status.value,
            },
        )


def set_progress(job_id: str, progress: float | None) -> None:
    bootstrap_jobs()
    with JOBS_LOCK:
        job = JOBS_REGISTRY.get(job_id)
        if not job or job.status == JobStatus.CANCELLED:
            return
        job.progress = progress
        job.updated_at = time.time()
    if job:
        _schedule_log_flush(job_id)
        from orcai_desktop_sidecar.job_stream import publish

        publish(
            job_id,
            {
                "type": "progress",
                "progress": progress,
                "status": job.status.value,
            },
        )


def set_status(
    job_id: str,
    status: JobStatus,
    *,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    exit_code: int | None = None,
    artifacts: list[str] | None = None,
    command_line: str | None = None,
) -> Job | None:
    """Update job status. Cancelled jobs cannot be overwritten by the worker."""
    bootstrap_jobs()
    _flush_dirty_logs()
    current = get_job(job_id)
    if not current:
        return None

    if current.status == JobStatus.CANCELLED and status != JobStatus.CANCELLED:
        return current

    if current.status in _TERMINAL_STATUSES and status not in _TERMINAL_STATUSES:
        return current

    with JOBS_LOCK:
        job = JOBS_REGISTRY.get(job_id) or current
        if status == JobStatus.RUNNING and job.started_at is None:
            job.started_at = time.time()
        job.status = status
        job.updated_at = time.time()
        if result is not None:
            job.result = result
            if artifacts is None and isinstance(result, dict):
                created = result.get("created_files") or result.get("artifacts")
                if isinstance(created, list):
                    job.artifacts = [str(p) for p in created]
        if error is not None:
            job.error = error
        if exit_code is not None:
            job.exit_code = exit_code
        if artifacts is not None:
            job.artifacts = list(artifacts)
        if command_line is not None:
            job.command_line = command_line
        if status == JobStatus.COMPLETED:
            job.progress = 1.0
            if job.exit_code is None:
                job.exit_code = 0
        elif status == JobStatus.CANCELLED and job.exit_code is None:
            job.exit_code = 130
        elif status == JobStatus.FAILED and job.exit_code is None:
            job.exit_code = 1
        if status in _TERMINAL_STATUSES:
            _trim_job_log(job, max_lines=JOB_LOG_TERMINAL_MAX_LINES)
        JOBS_REGISTRY[job_id] = job
        _log_dirty.discard(job_id)
        if status in _TERMINAL_STATUSES:
            _evict_terminal_jobs_unlocked(keep_id=job_id)
    sync_persist(job)
    from orcai_desktop_sidecar.job_stream import publish

    publish(
        job_id,
        {
            "type": "status",
            "status": job.status.value,
            "progress": job.progress,
            "exit_code": job.exit_code,
            "error": job.error,
            "started_at": job.started_at,
        },
    )
    return job
