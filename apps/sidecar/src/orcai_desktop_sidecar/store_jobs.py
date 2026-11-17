"""SQLite job row persistence."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.store_db import (
    db_session,
    normalize_project_dir,
    project_db_path,
)
from orcai_desktop_sidecar.store_projects import list_project_rows

def job_dict_from_row(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
    params = json.loads(row["params"]) if row["params"] else {}
    log = json.loads(row["log"]) if row["log"] else []
    result = json.loads(row["result"]) if row["result"] else None
    artifacts_raw = row["artifacts"] if "artifacts" in keys else None
    artifacts = json.loads(artifacts_raw) if artifacts_raw else []
    return {
        "id": row["id"],
        "command": row["command"],
        "params": params,
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "started_at": row["started_at"] if "started_at" in keys else None,
        "log": log,
        "result": result,
        "error": row["error"],
        "command_line": row["command_line"] if "command_line" in keys else None,
        "exit_code": row["exit_code"] if "exit_code" in keys else None,
        "progress": row["progress"] if "progress" in keys else None,
        "priority": int(row["priority"] or 0) if "priority" in keys else 0,
        "artifacts": artifacts if isinstance(artifacts, list) else [],
        "retry_of": row["retry_of"] if "retry_of" in keys else None,
    }


def persist_job(
    conn: sqlite3.Connection,
    job_dict: dict[str, Any],
) -> None:
    conn.execute(
        """
        INSERT INTO jobs (
            id, command, params, status, created_at, updated_at, log, result, error,
            command_line, exit_code, progress, priority, artifacts, retry_of, started_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at,
            log = excluded.log,
            result = excluded.result,
            error = excluded.error,
            command_line = excluded.command_line,
            exit_code = excluded.exit_code,
            progress = excluded.progress,
            priority = excluded.priority,
            artifacts = excluded.artifacts,
            retry_of = excluded.retry_of,
            started_at = excluded.started_at
        WHERE NOT (
            jobs.status = 'cancelled' AND excluded.status != 'cancelled'
        )
        AND NOT (
            jobs.status IN ('completed', 'failed')
            AND excluded.status NOT IN ('completed', 'failed', 'cancelled')
        )
        """,
        (
            job_dict["id"],
            job_dict["command"],
            json.dumps(job_dict.get("params") or {}),
            job_dict["status"],
            job_dict["created_at"],
            job_dict["updated_at"],
            json.dumps(job_dict.get("log") or []),
            json.dumps(job_dict.get("result"))
            if job_dict.get("result") is not None
            else None,
            job_dict.get("error"),
            job_dict.get("command_line"),
            job_dict.get("exit_code"),
            job_dict.get("progress"),
            int(job_dict.get("priority") or 0),
            json.dumps(job_dict.get("artifacts") or []),
            job_dict.get("retry_of"),
            job_dict.get("started_at"),
        ),
    )
    conn.commit()


def persist_job_everywhere(job_dict: dict[str, Any]) -> None:
    with db_session() as conn:
        persist_job(conn, job_dict)
    project_dir = (job_dict.get("params") or {}).get("project_dir")
    if project_dir:
        with db_session(project_db_path(project_dir)) as conn:
            persist_job(conn, job_dict)


def list_jobs_db(
    conn: sqlite3.Connection,
    *,
    limit: int | None = 200,
) -> list[dict[str, Any]]:
    if limit is None:
        rows = conn.execute(
            """
            SELECT * FROM jobs
            ORDER BY updated_at DESC
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT * FROM jobs
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [job_dict_from_row(row) for row in rows]


def get_job_db(conn: sqlite3.Connection, job_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return job_dict_from_row(row) if row else None


def _merge_job_row(
    merged: dict[str, dict[str, Any]],
    row: dict[str, Any],
) -> None:
    job_id = row["id"]
    existing = merged.get(job_id)
    if existing is None:
        merged[job_id] = row
        return
    existing_status = str(existing.get("status") or "")
    incoming_status = str(row.get("status") or "")
    active = {"running", "pending"}
    if existing_status == "cancelled" and incoming_status in active:
        return
    if incoming_status == "cancelled" and existing_status in active:
        merged[job_id] = row
        return
    if float(row["updated_at"]) >= float(existing["updated_at"]):
        merged[job_id] = row


def _params_project_dir(row: dict[str, Any]) -> str | None:
    params = row.get("params")
    if not isinstance(params, dict):
        return None
    raw = params.get("project_dir")
    if not isinstance(raw, str):
        return None
    return normalize_project_dir(raw)


def list_all_jobs(*, project_dir: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    """Merge jobs from app DB and optional project DB (dedupe by id, newest wins).

    With ``project_dir``, only jobs whose params name that project are returned.
    The scan is not cut off at ``limit`` first, so newer jobs of another project
    cannot hide this project's history.
    """
    merged: dict[str, dict[str, Any]] = {}
    scan_limit = None if project_dir else limit
    with db_session() as conn:
        for row in list_jobs_db(conn, limit=scan_limit):
            _merge_job_row(merged, row)
    if project_dir:
        with db_session(project_db_path(project_dir)) as conn:
            for row in list_jobs_db(conn, limit=scan_limit):
                _merge_job_row(merged, row)
        want = normalize_project_dir(project_dir)
        merged = {
            job_id: row
            for job_id, row in merged.items()
            if _params_project_dir(row) == want
        }
    return sorted(merged.values(), key=lambda j: j["updated_at"], reverse=True)[:limit]


def _job_ids_for_project(conn: sqlite3.Connection, project_dir: str) -> list[str]:
    want = normalize_project_dir(project_dir)
    if not want:
        return []
    rows = conn.execute("SELECT id, params FROM jobs").fetchall()
    ids: list[str] = []
    for row in rows:
        params = json.loads(row["params"]) if row["params"] else {}
        if normalize_project_dir(params.get("project_dir")) == want:
            ids.append(row["id"])
    return ids


def _delete_jobs_by_ids(conn: sqlite3.Connection, job_ids: list[str]) -> int:
    if not job_ids:
        return 0
    placeholders = ",".join("?" * len(job_ids))
    conn.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", job_ids)
    conn.execute(
        f"DELETE FROM predictions WHERE job_id IN ({placeholders})",
        job_ids,
    )
    conn.commit()
    return len(job_ids)


def clear_jobs_in_db(
    conn: sqlite3.Connection,
    *,
    project_dir: str | None = None,
) -> int:
    """Remove persisted jobs (and linked prediction rows) from one SQLite file."""
    if project_dir:
        return _delete_jobs_by_ids(conn, _job_ids_for_project(conn, project_dir))
    cur = conn.execute("DELETE FROM jobs")
    conn.execute("DELETE FROM predictions WHERE job_id IS NOT NULL")
    conn.commit()
    return int(cur.rowcount)


def clear_all_jobs_storage(*, project_dir: str | None = None) -> int:
    """Clear job history from app DB and known project DBs."""
    with db_session() as conn:
        total = clear_jobs_in_db(conn, project_dir=project_dir)
        project_paths = (
            []
            if project_dir
            else [row.get("path") for row in list_project_rows(conn)]
        )
    if project_dir:
        with db_session(project_db_path(project_dir)) as conn:
            total += clear_jobs_in_db(conn, project_dir=None)
        return total
    for path in project_paths:
        if not path:
            continue
        with db_session(project_db_path(path)) as conn:
            total += clear_jobs_in_db(conn, project_dir=None)
    return total

