"""SQLite connection, schema, and path helpers."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

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
    # Resolve via store module so ``patch(store._APP_DIR)`` in tests still works.
    from orcai_desktop_sidecar import store as store_mod

    app_dir = store_mod._APP_DIR
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir / "app.db"


def project_db_path(project_dir: str | Path) -> Path:
    root = Path(project_dir) / ".orcai-desktop"
    root.mkdir(parents=True, exist_ok=True)
    return root / "project.db"


def project_db_path_existing(project_dir: str | Path) -> Path:
    """Same as ``project_db_path`` but does not create the folder."""
    return Path(project_dir) / ".orcai-desktop" / "project.db"


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    """Open a SQLite connection.

    Prefer :func:`db_session` in production paths so the handle is always closed.
    Callers that use ``connect()`` directly must ``close()`` the connection.
    """
    path = db_path or default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: callers must use db_session (or close()) and not
    # share one Connection across threads without external locking.
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


