"""Plan-scoped cancel helpers (wizard / pipeline ``plan_id`` siblings)."""

from __future__ import annotations

from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import Job, JobStatus


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
    with JOBS_LOCK:
        return [
            sibling.id
            for sibling in JOBS_REGISTRY.values()
            if sibling.id != job.id
            and sibling.status == JobStatus.PENDING
            and _plan_id_of(sibling) == plan_id
        ]


def cancel_plan_after_failure(job_id: str) -> list[str]:
    """A failed plan step cancels its still-pending siblings (same ``plan_id``).

    Later steps depend on this one (``test`` after ``train``); running them
    would evaluate an older model or fail on missing inputs.
    """
    from orcai_desktop_sidecar.jobs import append_log, cancel_job, get_job

    job = get_job(job_id)
    if job is None or job.status != JobStatus.FAILED:
        return []
    cancelled: list[str] = []
    for sibling_id in _pending_plan_sibling_ids(job):
        cancel_job(sibling_id, cascade_plan=False)
        append_log(sibling_id, f"Plan step {job.command} failed; this step was not run.")
        cancelled.append(sibling_id)
    return cancelled
