"""Desktop maintenance: spectrogram cache wipe and factory reset of SQLite."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.store import (
    connect,
    list_project_rows,
    project_db_path_existing,
)

_CACHE_VERSION = 2


def spectrogram_cache_root() -> Path:
    override = os.environ.get("ORCAI_SPEC_CACHE_ROOT")
    if override:
        return Path(override)
    return Path.home() / ".orcai-desktop" / "spec-cache"


def clear_spectrogram_tile_cache(*, recreate: bool = True) -> dict[str, Any]:
    """Delete spectrogram tile files. RAM cache is cleared when numpy is available."""
    root = spectrogram_cache_root()
    files = 0
    bytes_removed = 0
    if root.is_dir():
        for path in root.rglob("*"):
            if path.is_file():
                try:
                    bytes_removed += path.stat().st_size
                    files += 1
                except OSError:
                    pass
        shutil.rmtree(root, ignore_errors=True)
    if recreate:
        root.mkdir(parents=True, exist_ok=True)
        if not os.environ.get("ORCAI_SPEC_CACHE_ROOT"):
            (root / f"v{_CACHE_VERSION}").mkdir(parents=True, exist_ok=True)
    try:
        from orcai_desktop_sidecar.adapters.spectrogram_cache import clear_ram_cache

        clear_ram_cache()
    except ImportError:
        pass
    return {
        "root": str(root),
        "files_removed": files,
        "bytes_removed": bytes_removed,
    }


def wipe_desktop_data_dir() -> dict[str, Any]:
    """Remove ``~/.orcai-desktop`` (SQLite, spectrogram cache, audio cache)."""
    from orcai_desktop_sidecar.store import _APP_DIR

    root = _APP_DIR
    existed = root.exists()
    if existed:
        shutil.rmtree(root, ignore_errors=True)
    return {"root": str(root), "removed": existed and not root.exists()}


def _unlink_sqlite(path: Path) -> int:
    removed = 0
    for candidate in (
        path,
        path.with_name(f"{path.name}-wal"),
        path.with_name(f"{path.name}-shm"),
    ):
        if candidate.is_file():
            candidate.unlink(missing_ok=True)
            removed += 1
    return removed


def reset_desktop_database() -> dict[str, Any]:
    """Cancel jobs, wipe app SQLite tables, remove per-project job DBs.

    Does not delete WAV / annotations / orcAI project folders on disk.
    """
    from orcai_desktop_sidecar.jobs import clear_jobs_history

    jobs = clear_jobs_history()
    conn = connect()
    try:
        paths = [row.get("path") for row in list_project_rows(conn)]
        conn.execute("DELETE FROM project_focus")
        conn.execute("DELETE FROM predictions")
        conn.execute("DELETE FROM projects")
        conn.commit()
    finally:
        conn.close()

    project_dbs_removed = 0
    projects_cleared = 0
    for raw in paths:
        if not raw:
            continue
        projects_cleared += 1
        project_dbs_removed += _unlink_sqlite(project_db_path_existing(raw))

    return {
        "deleted": jobs.get("deleted", 0),
        "cancelled_active": jobs.get("cancelled_active", 0),
        "projects_cleared": projects_cleared,
        "project_dbs_removed": project_dbs_removed,
    }


def factory_reset_desktop() -> dict[str, Any]:
    """Wipe Desktop SQLite, caches, and ``~/.orcai-desktop`` (first-launch data plane)."""
    database = reset_desktop_database()
    cache = clear_spectrogram_tile_cache(recreate=False)
    data_dir = wipe_desktop_data_dir()
    return {"database": database, "cache": cache, "data_dir": data_dir}
