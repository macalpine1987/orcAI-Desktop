"""Job registry public façade (re-exports).

Implementation lives in ``job_registry`` (bootstrap/create/list/status) and
``job_lifecycle`` (cancel/clear). Tests patch ``jobs._jobs`` / ``jobs._lock`` /
``jobs._sync_persist`` / ``jobs._bootstrapped`` — those names stay here.
"""

from __future__ import annotations

from orcai_desktop_sidecar.job_lifecycle import (
    cancel_job,
    clear_jobs_history,
)
from orcai_desktop_sidecar.job_logs import (
    JOB_LOG_MAX_LINES,
    JOB_LOG_TERMINAL_MAX_LINES,
    JOBS_MAX_TERMINAL_IN_MEMORY,
    job_log_abs_len,
    stop_log_flush_timer,
)
from orcai_desktop_sidecar.job_persist import (
    _prefer_job_copy,
    job_to_dict,
    sync_persist,
)
from orcai_desktop_sidecar.job_plan_cancel import cancel_plan_after_failure
from orcai_desktop_sidecar.job_registry import (
    append_log,
    bootstrap_jobs,
    cancel_jobs_on_shutdown,
    create_job,
    get_job,
    list_jobs,
    set_progress,
    set_status,
)
from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import Job, JobStatus
from orcai_desktop_sidecar.store import db_session

# Compat aliases for tests / older patches (``jobs._jobs`` / ``jobs._lock``).
_jobs = JOBS_REGISTRY
_lock = JOBS_LOCK
_sync_persist = sync_persist

# Reset by tests; read/written by job_registry / job_lifecycle via this module.
_bootstrapped = False

__all__ = [
    "JOB_LOG_MAX_LINES",
    "JOB_LOG_TERMINAL_MAX_LINES",
    "JOBS_MAX_TERMINAL_IN_MEMORY",
    "Job",
    "JobStatus",
    "append_log",
    "bootstrap_jobs",
    "cancel_job",
    "cancel_jobs_on_shutdown",
    "cancel_plan_after_failure",
    "clear_jobs_history",
    "create_job",
    "get_job",
    "job_log_abs_len",
    "job_to_dict",
    "list_jobs",
    "set_progress",
    "set_status",
    "stop_log_flush_timer",
]
