"""SQLite persistence for jobs and prediction outputs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

# Tests patch ``orcai_desktop_sidecar.store._APP_DIR`` — keep the name on this module.
_APP_DIR = Path.home() / ".orcai-desktop"

from orcai_desktop_sidecar.store_db import (  # noqa: E402
    _JOB_COLUMN_MIGRATIONS,
    _SCHEMA,
    _migrate_jobs_table,
    connect,
    db_session,
    default_db_path,
    normalize_project_dir,
    project_db_path,
    project_db_path_existing,
)
from orcai_desktop_sidecar.store_jobs import (  # noqa: E402
    _delete_jobs_by_ids,
    _job_ids_for_project,
    _merge_job_row,
    _params_project_dir,
    clear_all_jobs_storage,
    clear_jobs_in_db,
    get_job_db,
    job_dict_from_row,
    list_all_jobs,
    list_jobs_db,
    persist_job,
    persist_job_everywhere,
)
from orcai_desktop_sidecar.store_projects import (  # noqa: E402
    delete_project_row,
    get_project_focus_row,
    get_project_row,
    insert_project_row,
    list_project_rows,
    record_prediction,
    set_project_focus_row,
    upsert_project_row,
)

__all__ = [
    "clear_all_jobs_storage",
    "clear_jobs_in_db",
    "connect",
    "db_session",
    "default_db_path",
    "delete_project_row",
    "get_job_db",
    "get_project_focus_row",
    "get_project_row",
    "insert_project_row",
    "job_dict_from_row",
    "list_all_jobs",
    "list_jobs_db",
    "list_project_rows",
    "normalize_project_dir",
    "persist_job",
    "persist_job_everywhere",
    "project_db_path",
    "project_db_path_existing",
    "record_prediction",
    "set_project_focus_row",
    "upsert_project_row",
]


def __getattr__(name: str) -> Any:
    """``APP_DIR`` tracks ``_APP_DIR`` so tests that patch the alias stay consistent."""
    if name == "APP_DIR":
        return _APP_DIR
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
