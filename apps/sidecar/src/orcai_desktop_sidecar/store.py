"""SQLite persistence for jobs and prediction outputs."""

from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

_APP_DIR = Path.home() / ".orcai-desktop"


def normalize_project_dir(path: str | Path | None) -> str | None:
    """Canonical project path for job ↔ project matching (resolve, no trailing slash)."""
    if path is None:
        return None
    text = str(path).strip()
    if not text:
        return None
    try:
        return str(Path(text).expanduser().resolve())
    except (OSError, RuntimeError):
        return str(Path(text).expanduser())

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    params TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    log TEXT NOT NULL,
    result TEXT,
    error TEXT,
    command_line TEXT,
    exit_code INTEGER,
    progress REAL,
    priority INTEGER NOT NULL DEFAULT 0,
    artifacts TEXT,
    retry_of TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wav_path TEXT,
    label_path TEXT NOT NULL,
    model TEXT,
    command TEXT NOT NULL,
    job_id TEXT,
    project_dir TEXT,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predictions_project ON predictions(project_dir);
CREATE INDEX IF NOT EXISTS idx_predictions_label ON predictions(label_path);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    orcai_name TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- Desktop-only soft focus (FR-2.15): never written into orcAI JSON/CSV.
CREATE TABLE IF NOT EXISTS project_focus (
    project_id TEXT PRIMARY KEY,
    focus TEXT NOT NULL,
    updated_at REAL NOT NULL
);
"""

_JOB_COLUMN_MIGRATIONS = (
    ("command_line", "TEXT"),
    ("exit_code", "INTEGER"),
    ("progress", "REAL"),
    ("priority", "INTEGER NOT NULL DEFAULT 0"),
    ("artifacts", "TEXT"),
    ("retry_of", "TEXT"),
    ("started_at", "REAL"),
)


def _migrate_jobs_table(conn: sqlite3.Connection) -> None:
    cols = {
        row[1]
        for row in conn.execute("PRAGMA table_info(jobs)").fetchall()
    }
    for name, decl in _JOB_COLUMN_MIGRATIONS:
        if name not in cols:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {name} {decl}")
    conn.commit()


def default_db_path() -> Path:
    _APP_DIR.mkdir(parents=True, exist_ok=True)
    return _APP_DIR / "app.db"


def project_db_path(project_dir: str | Path) -> Path:
    root = Path(project_dir) / ".orcai-desktop"
    root.mkdir(parents=True, exist_ok=True)
    return root / "project.db"


def project_db_path_existing(project_dir: str | Path) -> Path:
    """Same as ``project_db_path`` but does not create the folder."""
    return Path(project_dir) / ".orcai-desktop" / "project.db"


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    _migrate_jobs_table(conn)
    return conn


@contextmanager
def db_session(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Open a SQLite connection and always close it."""
    conn = connect(db_path)
    try:
        yield conn
    finally:
        conn.close()


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
    persist_job(connect(), job_dict)
    project_dir = (job_dict.get("params") or {}).get("project_dir")
    if project_dir:
        persist_job(connect(project_db_path(project_dir)), job_dict)


def list_jobs_db(
    conn: sqlite3.Connection,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
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


def list_all_jobs(*, project_dir: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    """Merge jobs from app DB and optional project DB (dedupe by id, newest wins)."""
    merged: dict[str, dict[str, Any]] = {}
    for row in list_jobs_db(connect(), limit=limit):
        _merge_job_row(merged, row)
    if project_dir:
        for row in list_jobs_db(connect(project_db_path(project_dir)), limit=limit):
            _merge_job_row(merged, row)
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
    total = clear_jobs_in_db(connect(), project_dir=project_dir)
    if project_dir:
        total += clear_jobs_in_db(
            connect(project_db_path(project_dir)),
            project_dir=None,
        )
        return total
    for row in list_project_rows(connect()):
        path = row.get("path")
        if not path:
            continue
        total += clear_jobs_in_db(connect(project_db_path(path)), project_dir=None)
    return total


def record_prediction(
    conn: sqlite3.Connection,
    *,
    label_path: str,
    wav_path: str | None = None,
    model: str | None = None,
    command: str = "predict",
    job_id: str | None = None,
    project_dir: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO predictions (wav_path, label_path, model, command, job_id, project_dir, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            wav_path,
            label_path,
            model,
            command,
            job_id,
            project_dir,
            time.time(),
        ),
    )
    conn.commit()


def list_predictions(
    conn: sqlite3.Connection,
    *,
    project_dir: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    if project_dir:
        rows = conn.execute(
            """
            SELECT * FROM predictions
            WHERE project_dir = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (project_dir, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT * FROM predictions
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def list_project_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM projects ORDER BY updated_at DESC",
    ).fetchall()
    return [dict(row) for row in rows]


def get_project_row(conn: sqlite3.Connection, project_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return dict(row) if row else None


def upsert_project_row(
    conn: sqlite3.Connection,
    *,
    id: str,
    path: str,
    display_name: str,
    description: str,
    orcai_name: str,
    created_at: float,
    updated_at: float,
) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO projects (id, path, display_name, description, orcai_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            display_name = excluded.display_name,
            description = excluded.description,
            orcai_name = excluded.orcai_name,
            updated_at = excluded.updated_at
        """,
        (id, path, display_name, description, orcai_name, created_at, updated_at),
    )
    conn.commit()
    row = get_project_row(conn, id)
    assert row is not None
    return row


def insert_project_row(
    conn: sqlite3.Connection,
    *,
    id: str,
    path: str,
    display_name: str,
    description: str,
    orcai_name: str,
    created_at: float,
    updated_at: float,
) -> dict[str, Any]:
    """Insert-only — never rewrite another row's path (register race / P2-05)."""
    conn.execute(
        """
        INSERT INTO projects (id, path, display_name, description, orcai_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (id, path, display_name, description, orcai_name, created_at, updated_at),
    )
    conn.commit()
    row = get_project_row(conn, id)
    assert row is not None
    return row


def delete_project_row(conn: sqlite3.Connection, project_id: str) -> None:
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.execute("DELETE FROM project_focus WHERE project_id = ?", (project_id,))
    conn.commit()


def get_project_focus_row(conn: sqlite3.Connection, project_id: str) -> str | None:
    row = conn.execute(
        "SELECT focus FROM project_focus WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    return str(row["focus"]) if row else None


def set_project_focus_row(conn: sqlite3.Connection, project_id: str, focus: str) -> None:
    conn.execute(
        """
        INSERT INTO project_focus (project_id, focus, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
            focus = excluded.focus,
            updated_at = excluded.updated_at
        """,
        (project_id, focus, time.time()),
    )
    conn.commit()


def scan_label_files(
    directory: str | Path,
    *,
    limit: int = 200,
) -> list[dict[str, str]]:
    root = Path(directory)
    if not root.is_dir():
        return []

    found: list[dict[str, str]] = []
    for pattern in ("*_predicted.txt", "*_filtered.txt"):
        for path in sorted(root.rglob(pattern), key=lambda p: p.stat().st_mtime, reverse=True):
            if len(found) >= limit:
                break
            found.append(
                {
                    "label_path": str(path.resolve()),
                    "kind": "filtered" if path.name.endswith("_filtered.txt") else "predicted",
                    "name": path.name,
                }
            )
    return found
