"""SQLite project / focus / prediction rows."""

from __future__ import annotations

import sqlite3
import time
from typing import Any

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
    if row is None:
        raise RuntimeError(f"Project row missing after upsert: {id}")
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
    if row is None:
        raise RuntimeError(f"Project row missing after insert: {id}")
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
