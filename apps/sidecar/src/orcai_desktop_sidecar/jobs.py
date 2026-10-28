"""Job registry with SQLite persistence."""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from orcai_desktop_sidecar.cli_command import build_command_line
from orcai_desktop_sidecar.job_cancel import (
    register as register_job_cancel,
)
from orcai_desktop_sidecar.job_cancel import (
    request_cancel as request_job_cancel,
)
from orcai_desktop_sidecar.store import (
    clear_all_jobs_storage,
    connect,
    get_job_db,
    list_all_jobs,
    normalize_project_dir,
    persist_job_everywhere,
    project_db_path_existing,
)

_log = logging.getLogger(__name__)

_lock = threading.Lock()
_jobs: dict[str, Job] = {}
_bootstrapped = False

# Batch log persistence — avoid full SQLite rewrite on every print line.
_LOG_FLUSH_INTERVAL_SEC = 0.35
_log_dirty: set[str] = set()
_log_flush_timer: threading.Timer | None = None


def _flush_dirty_logs() -> None:
    global _log_flush_timer
    with _lock:
        _log_flush_timer = None
        dirty = list(_log_dirty)
        _log_dirty.clear()
        jobs = [(_jobs[jid],) for jid in dirty if jid in _jobs]
    for (job,) in jobs:
        _sync_persist(job)


def _schedule_log_flush(job_id: str) -> None:
    global _log_flush_timer
    with _lock:
        _log_dirty.add(job_id)
        if _log_flush_timer is not None:
            return
        timer = threading.Timer(_LOG_FLUSH_INTERVAL_SEC, _flush_dirty_logs)
        timer.daemon = True
        _log_flush_timer = timer
        timer.start()


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


_TERMINAL_STATUSES = frozenset(
    {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}
)


@dataclass
class Job:
    id: str
    command: str
    params: dict[str, Any]
    status: JobStatus = JobStatus.PENDING
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    # Wall clock when worker entered RUNNING (excludes plan/queue wait).
    started_at: float | None = None
    log: list[str] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    command_line: str | None = None
    exit_code: int | None = None
    progress: float | None = None
    priority: int = 0
    artifacts: list[str] = field(default_factory=list)
    retry_of: str | None = None


def _job_from_dict(data: dict[str, Any]) -> Job:
    started_raw = data.get("started_at")
    started_at: float | None = None
    if started_raw is not None:
        try:
            started_at = float(started_raw)
        except (TypeError, ValueError):
            started_at = None
    return Job(
        id=data["id"],
        command=data["command"],
        params=data.get("params") or {},
        status=JobStatus(data["status"]),
        created_at=float(data["created_at"]),
        updated_at=float(data["updated_at"]),
        started_at=started_at,
        log=list(data.get("log") or []),
        result=data.get("result"),
        error=data.get("error"),
        command_line=data.get("command_line"),
        exit_code=data.get("exit_code"),
        progress=data.get("progress"),
        priority=int(data.get("priority") or 0),
        artifacts=list(data.get("artifacts") or []),
        retry_of=data.get("retry_of"),
    )


def _existing_project_db(project_dir: str | None) -> sqlite3.Connection | None:
    """Open a project DB that is already on disk. Do not create the folder."""
    if not project_dir:
        return None
    path = project_db_path_existing(project_dir)
    if not path.is_file():
        return None
    return connect(path)


def _persisted_cancelled(job: Job) -> bool:
    """True when app or project SQLite already stores this job as cancelled."""
    project_dir = (job.params.get("project_dir") if job.params else None) or None
    databases = [connect()]
    project_db = _existing_project_db(project_dir)
    if project_db is not None:
        databases.append(project_db)
    for db in databases:
        row = get_job_db(db, job.id)
        if row and str(row.get("status")) == JobStatus.CANCELLED.value:
            return True
    return False


def _sync_persist(job: Job) -> None:
    # A worker still marked running must not overwrite a cancel the parent wrote.
    # A missing or unwritable project folder must not abort the in-memory job.
    try:
        if job.status != JobStatus.CANCELLED and _persisted_cancelled(job):
            return
        persist_job_everywhere(job_to_dict(job))
    except Exception:  # noqa: BLE001 — persist is best-effort; keep in-memory job
        _log.debug("persist_job_everywhere failed for %s", job.id, exc_info=True)


_ACTIVE_STATUSES = (JobStatus.RUNNING, JobStatus.PENDING)


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


def bootstrap_jobs() -> None:
    global _bootstrapped
    with _lock:
        if _bootstrapped:
            return
        for row in list_all_jobs(limit=500):
            _jobs[row["id"]] = _job_from_dict(row)
        _bootstrapped = True


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
    bootstrap_jobs()
    with _lock:
        pending = [
            job.id for job in _jobs.values() if job.status == JobStatus.PENDING
        ]
        running = [
            job.id for job in _jobs.values() if job.status == JobStatus.RUNNING
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
    with _lock:
        _jobs[job.id] = job
    _sync_persist(job)
    return job


def get_job(job_id: str) -> Job | None:
    """Return job state. A cancelled copy beats a newer running or pending one."""
    bootstrap_jobs()
    with _lock:
        mem = _jobs.get(job_id)
        project_dir = (mem.params.get("project_dir") if mem else None) or None

    latest: Job | None = mem
    dbs = [connect()]
    project_db = _existing_project_db(project_dir)
    if project_db is not None:
        dbs.append(project_db)

    for db in dbs:
        row = get_job_db(db, job_id)
        if not row:
            continue
        latest = _prefer_job_copy(latest, _job_from_dict(row))

    if latest:
        with _lock:
            _jobs[job_id] = latest
    return latest


def list_jobs(project_dir: str | None = None) -> list[Job]:
    bootstrap_jobs()
    rows = list_all_jobs(project_dir=project_dir, limit=200)
    jobs = [_job_from_dict(row) for row in rows]
    chosen: list[Job] = []
    with _lock:
        for job in jobs:
            kept = _prefer_job_copy(_jobs.get(job.id), job) or job
            _jobs[job.id] = kept
            chosen.append(kept)
    return chosen


def append_log(job_id: str, line: str) -> None:
    bootstrap_jobs()
    job: Job | None = None
    index = -1
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.log.append(line)
            index = len(job.log) - 1
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
    with _lock:
        job = _jobs.get(job_id)
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

    with _lock:
        job = _jobs.get(job_id) or current
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
        _jobs[job_id] = job
        _log_dirty.discard(job_id)
    _sync_persist(job)
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


def _plan_id_of(job: Job) -> str | None:
    """Desktop-only tag linking wizard/pipeline plan jobs (not passed to orcAI)."""
    raw = (job.params or {}).get("plan_id")
    if isinstance(raw, str):
        text = raw.strip()
        return text or None
    return None


def _pending_plan_sibling_ids(job: Job) -> list[str]:
    plan_id = _plan_id_of(job)
    if not plan_id:
        return []
    with _lock:
        return [
            sibling.id
            for sibling in _jobs.values()
            if sibling.id != job.id
            and sibling.status == JobStatus.PENDING
            and _plan_id_of(sibling) == plan_id
        ]


def cancel_plan_after_failure(job_id: str) -> list[str]:
    """A failed plan step cancels its still-pending siblings (same ``plan_id``).

    Later steps depend on this one (``test`` after ``train``); running them
    would evaluate an older model or fail on missing inputs.
    """
    job = get_job(job_id)
    if job is None or job.status != JobStatus.FAILED:
        return []
    cancelled: list[str] = []
    for sibling_id in _pending_plan_sibling_ids(job):
        cancel_job(sibling_id, cascade_plan=False)
        append_log(sibling_id, f"Plan step {job.command} failed; this step was not run.")
        cancelled.append(sibling_id)
    return cancelled


def _started_at_after_stop(job_id: str, job: Job) -> float | None:
    """Start time of a cancelled job, re-read after its worker has stopped."""
    if job.started_at is not None:
        return job.started_at
    try:
        latest = get_job(job_id)
    except Exception:  # noqa: BLE001 — fall back to the in-memory copy
        latest = None
    return latest.started_at if latest is not None else None


def _finish_cancelled_job(job_id: str) -> None:
    """Kill the worker, wait, sweep artifacts, then free the queue slot.

    Runs after the row is already ``CANCELLED``. ``settle=True`` calls this in
    the request thread; ``settle=False`` runs it on a daemon thread.
    """
    from orcai_desktop_sidecar.cancel_cleanup import cleanup_partial_artifacts
    from orcai_desktop_sidecar.job_cancel import terminate_worker, wait_worker_stopped
    from orcai_desktop_sidecar.job_memory import HEAVY_TF_COMMANDS
    from orcai_desktop_sidecar.job_queue import get_scheduler

    job = get_job(job_id)
    if job is None:
        return

    hard_stop = terminate_worker(job_id)
    # Subprocess already joined inside terminate_worker; threads join here.
    wait_worker_stopped(job_id, timeout=1.0)
    if hard_stop:
        with _lock:
            refreshed = _jobs.get(job_id)
            if refreshed:
                refreshed.log.append(
                    "Worker process killed (release memory)."
                    if refreshed.command in HEAVY_TF_COMMANDS
                    else "Worker process terminated."
                )
                refreshed.updated_at = time.time()
                job = refreshed
        _sync_persist(job)

    # A queued job never wrote anything: its output paths hold earlier results.
    started_at = _started_at_after_stop(job_id, job)
    cleaned: list[str] = []
    if started_at is not None:

        def sweep() -> list[str]:
            return cleanup_partial_artifacts(
                job.command, job.params, since=started_at
            )

        # Cleanup only after writers have stopped; second sweep catches late FS writes.
        cleaned = sweep()
        time.sleep(0.05)
        cleaned = list(dict.fromkeys([*cleaned, *sweep()]))
        # If an in-process writer outlived the first wait, settle once more.
        if not wait_worker_stopped(job_id, timeout=0.5):
            time.sleep(0.05)
            cleaned = list(dict.fromkeys([*cleaned, *sweep()]))
    if cleaned:
        with _lock:
            job = _jobs.get(job_id) or job
            job.artifacts = list(dict.fromkeys([*job.artifacts, *cleaned]))
            job.log.append(f"Cleaned partial artifacts: {len(cleaned)}")
            job.result = {
                **(job.result or {}),
                "cancelled": True,
                "cleaned_artifacts": cleaned,
                "incomplete": True,
            }
            job.updated_at = time.time()
            _jobs[job_id] = job
        _sync_persist(job)

    get_scheduler().notify_finished(job_id)
    try:
        from orcai_desktop_sidecar.sleep_prevent import release_keep_awake

        release_keep_awake(job_id)
    except Exception:  # noqa: BLE001 — sleep inhibit must never break cancel
        _log.debug("release_keep_awake failed", exc_info=True)


def cancel_job(
    job_id: str, *, cascade_plan: bool = True, settle: bool = True
) -> Job | None:
    """
    Request cancellation; stop the worker, then clean partial artifacts.

    Order (NFR-6): cooperative cancel → mark CANCELLED → terminate/wait worker
    → cleanup (with a second sweep). Cleanup must not run while the writer is live.

    ``settle=True`` finishes that work before returning (shutdown, plan siblings,
    tests). ``settle=False`` records CANCELLED, then finishes on a daemon thread
    and returns the cancelled job immediately.

    When ``cascade_plan`` is true and the job has ``params.plan_id`` (wizard /
    multi-step train plan), also cancel every still-pending sibling in that plan
    so later steps (e.g. ``test``) do not start after an aborted ``train``.
    Pending siblings are cancelled first while the target may still be running,
    so the scheduler cannot pick them up when the slot frees.
    """
    from orcai_desktop_sidecar.job_queue import get_scheduler

    bootstrap_jobs()

    if cascade_plan:
        head = get_job(job_id)
        if head is not None:
            for sibling_id in _pending_plan_sibling_ids(head):
                cancel_job(sibling_id, cascade_plan=False)

    request_job_cancel(job_id)
    get_scheduler().cancel_pending(job_id)

    job = get_job(job_id)
    if not job:
        return None

    if job.status in (JobStatus.PENDING, JobStatus.RUNNING):
        with _lock:
            job = _jobs.get(job_id) or job
            job.status = JobStatus.CANCELLED
            job.error = "Cancelled by user"
            job.exit_code = 130
            job.updated_at = time.time()
            job.log.append("Cancelled by user.")
            _jobs[job_id] = job
        _sync_persist(job)
        from orcai_desktop_sidecar.job_stream import publish

        publish(
            job_id,
            {
                "type": "status",
                "status": JobStatus.CANCELLED.value,
                "progress": job.progress,
                "exit_code": 130,
                "error": job.error,
                "started_at": job.started_at,
            },
        )
        if not settle:
            threading.Thread(
                target=_finish_cancelled_job,
                args=(job_id,),
                daemon=True,
                name=f"cancel-{job_id[:8]}",
            ).start()
            return get_job(job_id)
        _finish_cancelled_job(job_id)
    else:
        from orcai_desktop_sidecar.job_cancel import terminate_worker

        terminate_worker(job_id)
        get_scheduler().notify_finished(job_id)
        try:
            from orcai_desktop_sidecar.sleep_prevent import release_keep_awake

            release_keep_awake(job_id)
        except Exception:  # noqa: BLE001 — sleep inhibit must never break cancel
            _log.debug("release_keep_awake failed", exc_info=True)
    return get_job(job_id)


def clear_jobs_history(project_dir: str | None = None) -> dict[str, Any]:
    """Cancel active jobs, then erase job rows from SQLite (and in-memory registry)."""
    global _bootstrapped
    from orcai_desktop_sidecar.job_cancel import request_cancel
    from orcai_desktop_sidecar.job_queue import get_scheduler

    bootstrap_jobs()
    snapshot = list_jobs(project_dir)
    if project_dir:
        want = normalize_project_dir(project_dir)
        snapshot = [
            job
            for job in snapshot
            if normalize_project_dir(job.params.get("project_dir")) == want
        ]
    cancelled = 0
    scheduler = get_scheduler()
    for job in snapshot:
        if job.status == JobStatus.RUNNING:
            cancel_job(job.id)
            cancelled += 1
        elif job.status == JobStatus.PENDING:
            request_cancel(job.id)
            scheduler.cancel_pending(job.id)
            scheduler.notify_finished(job.id)
            cancelled += 1
    _flush_dirty_logs()
    deleted = clear_all_jobs_storage(project_dir=project_dir)
    with _lock:
        if project_dir:
            to_drop = [
                job_id
                for job_id, job in _jobs.items()
                if normalize_project_dir(job.params.get("project_dir"))
                == normalize_project_dir(project_dir)
            ]
            for job_id in to_drop:
                _jobs.pop(job_id, None)
                _log_dirty.discard(job_id)
        else:
            _jobs.clear()
            _log_dirty.clear()
    _bootstrapped = True
    return {
        "deleted": deleted,
        "cancelled_active": cancelled,
        "project_dir": project_dir,
    }


def job_to_dict(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "command": job.command,
        "params": job.params,
        "status": job.status.value,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "started_at": job.started_at,
        "log": job.log,
        "result": job.result,
        "error": job.error,
        "command_line": job.command_line,
        "exit_code": job.exit_code,
        "progress": job.progress,
        "priority": job.priority,
        "artifacts": job.artifacts,
        "retry_of": job.retry_of,
    }
