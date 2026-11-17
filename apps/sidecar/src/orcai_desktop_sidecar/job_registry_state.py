"""Single shared in-memory job registry (lock + map).

Imported by jobs, job_logs, job_persist, and plan-cancel helpers so there is
exactly one lock / jobs map pair process-wide.
"""

from __future__ import annotations

import threading

from orcai_desktop_sidecar.job_types import Job

JOBS_LOCK = threading.Lock()
JOBS_REGISTRY: dict[str, Job] = {}

# Thin aliases for one-release compatibility (tests / older patches).
_lock = JOBS_LOCK
_jobs = JOBS_REGISTRY


def get_jobs_lock() -> threading.Lock:
    return JOBS_LOCK


def get_jobs_registry() -> dict[str, Job]:
    return JOBS_REGISTRY
