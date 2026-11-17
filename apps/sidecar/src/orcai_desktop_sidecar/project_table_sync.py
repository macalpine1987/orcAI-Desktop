"""Recording-table / init job param builders (extracted from project_registry)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import (
    annotations_dir,
    recording_table_path,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.store import db_session, get_project_row


def sync_table_job_params(
    project_id: str,
    *,
    overwrite: bool = False,
    update_table: bool = False,
    default_channel: int | None = None,
    remove_duplicate_filenames: bool = False,
    exclude_patterns: str | None = None,
) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    project_dir = Path(row["path"]).resolve()
    rec = recordings_dir(project_dir)
    ann = annotations_dir(project_dir)
    orcai_param = project_dir / f"{row['orcai_name']}_orcai_parameter.json"

    table_path = (
        resolve_recording_table_path(project_dir)
        or recording_table_path(project_dir)
    )
    resolved_update: str | bool | None = None
    if update_table and not overwrite:
        if table_path.is_file():
            resolved_update = str(table_path)
        elif update_table is True:
            # API/UI merge flag before the CSV exists — helpers_cmd treats True as output_path
            resolved_update = True

    channel = 1 if default_channel is None else max(1, int(default_channel))
    params: dict[str, Any] = {
        "base_dir_recording": str(rec),
        "output_path": str(table_path),
        "base_dir_annotation": str(ann) if ann.is_dir() else None,
        "default_channel": channel,
        "overwrite": overwrite,
        "update_table": resolved_update,
        "update_paths": True,
        "verbosity": 2,
    }
    if remove_duplicate_filenames:
        params["remove_duplicate_filenames"] = True
    ep = (exclude_patterns or "").strip()
    if ep:
        params["exclude_patterns"] = ep
    if orcai_param.is_file():
        params["orcai_parameter"] = str(orcai_param)
    return {k: v for k, v in params.items() if v is not None}


def init_job_params(project_id: str) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")
    return {
        "project_dir": row["path"],
        "project_name": row["orcai_name"],
        "verbosity": 2,
    }
