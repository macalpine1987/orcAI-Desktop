"""Cancel / clear-history flows for the job registry."""

from __future__ import annotations

import contextlib
import logging
import threading
import time
from typing import Any

from orcai_desktop_sidecar.job_cancel import (
    request_cancel as request_job_cancel,
)
from orcai_desktop_sidecar.job_logs import _flush_dirty_logs, _log_dirty, _push_log_line
from orcai_desktop_sidecar.job_persist import sync_persist
from orcai_desktop_sidecar.job_plan_cancel import _pending_plan_sibling_ids
from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import Job, JobStatus
from orcai_desktop_sidecar.store import clear_all_jobs_storage, normalize_project_dir

_log = logging.getLogger(__name__)


def _started_at_after_stop(job_id: str, job: Job) -> float | None:
    """Start time of a cancelled job, re-read after its worker has stopped."""
    from orcai_desktop_sidecar.job_registry import get_job

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
    from orcai_desktop_sidecar.job_registry import get_job

    job = get_job(job_id)
    if job is None:
        return

    hard_stop = terminate_worker(job_id)
    # Subprocess already joined inside terminate_worker; threads join here.
    wait_worker_stopped(job_id, timeout=1.0)
    if hard_stop:
        with JOBS_LOCK:
            refreshed = JOBS_REGISTRY.get(job_id)
            if refreshed:
                _push_log_line(
                    refreshed,
                    (
                        "Worker process killed (release memory)."
                        if refreshed.command in HEAVY_TF_COMMANDS
                        else "Worker process terminated."
                    ),
                )
                refreshed.updated_at = time.time()
                job = refreshed
        sync_persist(job)

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
        with JOBS_LOCK:
            job = JOBS_REGISTRY.get(job_id) or job
            job.artifacts = list(dict.fromkeys([*job.artifacts, *cleaned]))
            _push_log_line(job, f"Cleaned partial artifacts: {len(cleaned)}")
            job.result = {
                **(job.result or {}),
                "cancelled": True,
                "cleaned_artifacts": cleaned,
                "incomplete": True,
            }
            job.updated_at = time.time()
            JOBS_REGISTRY[job_id] = job
        sync_persist(job)

    get_scheduler().notify_finished(job_id)
    try:
        from orcai_desktop_sidecar.job_cancel import clear as clear_cancel

        clear_cancel(job_id)
    except Exception:  # noqa: BLE001 — cancel path must stay resilient
        _log.debug("clear cancel state failed", exc_info=True)
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
    from orcai_desktop_sidecar.job_registry import bootstrap_jobs, get_job

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
        with JOBS_LOCK:
            job = JOBS_REGISTRY.get(job_id) or job
            job.status = JobStatus.CANCELLED
            job.error = "Cancelled by user"
            job.exit_code = 130
            job.updated_at = time.time()
            _push_log_line(job, "Cancelled by user.")
            JOBS_REGISTRY[job_id] = job
        sync_persist(job)
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
    from orcai_desktop_sidecar.job_cancel import request_cancel
    from orcai_desktop_sidecar.job_queue import get_scheduler
    from orcai_desktop_sidecar.job_registry import bootstrap_jobs, list_jobs

    from orcai_desktop_sidecar import jobs as jobs_mod

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
    from orcai_desktop_sidecar.job_cancel import clear as clear_cancel

    with JOBS_LOCK:
        if project_dir:
            to_drop = [
                job_id
                for job_id, job in JOBS_REGISTRY.items()
                if normalize_project_dir(job.params.get("project_dir"))
                == normalize_project_dir(project_dir)
            ]
            for job_id in to_drop:
                JOBS_REGISTRY.pop(job_id, None)
                _log_dirty.discard(job_id)
        else:
            to_drop = list(JOBS_REGISTRY.keys())
            JOBS_REGISTRY.clear()
            _log_dirty.clear()
    for job_id in to_drop:
        with contextlib.suppress(Exception):
            clear_cancel(job_id)
    jobs_mod._bootstrapped = True
    return {
        "deleted": deleted,
        "cancelled_active": cancelled,
        "project_dir": project_dir,
    }
