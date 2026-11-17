"""Project CRUD read/list (registry façade re-exports from project_crud)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_crud_helpers import (
    _is_initialized,
    _prune_missing_project_rows,
)
from orcai_desktop_sidecar.project_focus_settings import (
    get_auto_sync_recording_table,
    get_predict_model_settings,
    get_spectrogram_colormap,
    get_stored_focus,
    project_kind_from_manifest,
    _read_desktop_focus_file,
)
from orcai_desktop_sidecar.project_paths import (
    _looks_like_project_dir,
    read_manifest,
    recordings_dir,
    resolve_recording_table_path,
    slugify,
)
from orcai_desktop_sidecar.project_recordings_io import (
    list_wav_files,
)
from orcai_desktop_sidecar.store import (
    db_session,
    delete_project_row,
    get_project_row,
    list_project_rows,
    set_project_focus_row,
)


class ProjectNameConflictError(Exception):
    """Raised when display name or folder slug collides under the parent directory."""

    def __init__(self, conflicts: list[dict[str, Any]]) -> None:
        self.conflicts = conflicts
        super().__init__("project_name_conflict")



def project_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    project_dir = Path(row["path"]).expanduser()
    try:
        project_dir = project_dir.resolve()
    except OSError:
        project_dir = Path(row["path"])
    try:
        manifest = read_manifest(project_dir)
    except (ValueError, TypeError, OSError):
        # Corrupt / non-object project.json must not kill the whole list (P2-04).
        manifest = None
    table = resolve_recording_table_path(project_dir)
    rec_dir = recordings_dir(project_dir)
    wav_count = len(list_wav_files(rec_dir)) if rec_dir.is_dir() else 0
    stored_focus = get_stored_focus(row["id"])
    # Portable desktop_focus.json wins over SQLite when present (USB / P2-09).
    if project_dir.is_dir():
        file_focus = _read_desktop_focus_file(project_dir)
        if file_focus is not None and file_focus != stored_focus:
            with db_session() as conn:
                set_project_focus_row(conn, row["id"], file_focus)
            stored_focus = file_focus

    predict_model: str | None = None
    predict_model_dir: str | None = None
    spectrogram_colormap: str | None = None
    auto_sync = True
    if project_dir.is_dir():
        auto_sync = get_auto_sync_recording_table(project_dir)
        predict_model, predict_model_dir = get_predict_model_settings(project_dir)
        spectrogram_colormap = get_spectrogram_colormap(project_dir)

    return {
        "id": row["id"],
        "path": str(project_dir),
        "display_name": row["display_name"],
        "description": row.get("description") or "",
        "orcai_name": row["orcai_name"],
        "project_kind": project_kind_from_manifest(manifest),
        "focus": stored_focus,
        "focus_source": "stored" if stored_focus else "inferred",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "recording_table_path": str(table) if table is not None else None,
        "recordings_dir": str(rec_dir),
        "wav_count": wav_count,
        "initialized": _is_initialized(project_dir, row["orcai_name"]),
        "auto_sync_recording_table": auto_sync,
        "predict_model": predict_model,
        "predict_model_dir": predict_model_dir,
        "spectrogram_colormap": spectrogram_colormap,
        "manifest": manifest,
    }


def list_projects() -> list[dict[str, Any]]:
    with db_session() as conn:
        _prune_missing_project_rows(conn)
        rows = list_project_rows(conn)
        out: list[dict[str, Any]] = []
        for row in rows:
            if not Path(row["path"]).is_dir():
                continue
            out.append(project_to_dict(row))
    return sorted(out, key=lambda p: p["updated_at"], reverse=True)


def get_project(project_id: str) -> dict[str, Any] | None:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            return None
        if not Path(row["path"]).is_dir():
            delete_project_row(conn, project_id)
            return None
        return project_to_dict(row)


def get_project_by_path(path: str | Path) -> dict[str, Any] | None:
    resolved = str(Path(path).expanduser().resolve())
    target = Path(resolved)
    if not target.is_dir():
        with db_session() as conn:
            for row in list_project_rows(conn):
                if str(Path(row["path"]).expanduser().resolve()) == resolved:
                    delete_project_row(conn, row["id"])
        return None
    with db_session() as conn:
        for row in list_project_rows(conn):
            if str(Path(row["path"]).expanduser().resolve()) == resolved:
                return project_to_dict(row)
    return None


def check_project_name_available(
    parent_dir: str,
    display_name: str,
    *,
    orcai_name: str | None = None,
    exclude_id: str | None = None,
    exclude_path: str | Path | None = None,
    display_name_only: bool = False,
) -> dict[str, Any]:
    """Return whether a new project name/slug is free under parent_dir.

    When ``display_name_only`` is True (rename of an existing project label),
    only ``display_name`` collisions are checked — folder slug stays unchanged.
    """
    parent = Path(parent_dir).expanduser().resolve()
    excluded_resolved = (
        str(Path(exclude_path).resolve()) if exclude_path is not None else None
    )
    if not parent.is_dir():
        raise FileNotFoundError(f"Parent directory not found: {parent}")

    name = display_name.strip()
    if not name:
        raise ValueError("display_name is required")

    slug = slugify(orcai_name or name)
    target_dir = (parent / slug).resolve()
    name_key = name.casefold()

    conflicts: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def _add(reason: str, **fields: Any) -> None:
        key = (reason, str(fields.get("path") or fields.get("id") or name_key))
        if key in seen:
            return
        seen.add(key)
        conflicts.append({"reason": reason, **fields})

    with db_session() as conn:
        _prune_missing_project_rows(conn)
        rows = list_project_rows(conn)
    for row in rows:
        if exclude_id and row["id"] == exclude_id:
            continue
        row_path = Path(row["path"]).expanduser().resolve()
        if excluded_resolved and str(row_path) == excluded_resolved:
            continue
        # Offline (e.g. USB unplugged): do not block name checks.
        if not row_path.exists():
            continue
        if row_path.parent != parent:
            continue
        if row["display_name"].strip().casefold() == name_key:
            _add(
                "display_name",
                id=row["id"],
                display_name=row["display_name"],
                path=str(row_path),
            )
        if display_name_only:
            continue
        if row_path.name.casefold() == slug.casefold():
            _add(
                "slug",
                id=row["id"],
                display_name=row["display_name"],
                path=str(row_path),
            )

    if not display_name_only and target_dir.exists() and str(target_dir) != excluded_resolved:
        known_paths = {c.get("path") for c in conflicts if c.get("path")}
        if str(target_dir) not in known_paths:
            has_entries = any(target_dir.iterdir()) if target_dir.is_dir() else True
            extra: dict[str, Any] = {}
            if _looks_like_project_dir(target_dir):
                extra["suggest_register"] = True
            _add(
                "directory",
                path=str(target_dir),
                display_name=name if has_entries else None,
                **extra,
            )

    return {
        "available": len(conflicts) == 0,
        "conflicts": conflicts,
        "slug": slug,
        "project_dir": str(target_dir),
    }

