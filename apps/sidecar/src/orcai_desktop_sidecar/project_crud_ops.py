"""Project CRUD mutating ops (create / register / update / delete)."""

from __future__ import annotations

import contextlib
import shutil
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_crud_helpers import (
    _detect_cli_orcai_name,
    _unique_register_display_name,
)
from orcai_desktop_sidecar.project_crud_read import (
    ProjectNameConflictError,
    check_project_name_available,
    get_project,
    get_project_by_path,
    project_to_dict,
)
from orcai_desktop_sidecar.project_focus_settings import (
    _SPECTROGRAM_COLORMAPS,
    _read_desktop_focus_file,
    _read_desktop_settings,
    _write_desktop_focus_file,
    _write_desktop_settings,
    focus_to_project_kind,
    normalize_focus,
    normalize_project_kind,
)
from orcai_desktop_sidecar.project_paths import (
    PROJECT_KIND_RECOGNITION,
    annotations_dir,
    read_manifest,
    recordings_dir,
    slugify,
    write_manifest,
)
from orcai_desktop_sidecar.project_recordings_io import (
    import_recordings,
)
from orcai_desktop_sidecar.store import (
    clear_all_jobs_storage,
    db_session,
    delete_project_row,
    get_project_row,
    insert_project_row,
    list_project_rows,
    set_project_focus_row,
    upsert_project_row,
)


def create_project(
    *,
    parent_dir: str,
    display_name: str,
    description: str = "",
    orcai_name: str | None = None,
    import_paths: list[str] | None = None,
    project_kind: str = PROJECT_KIND_RECOGNITION,
    focus: str | None = None,
) -> dict[str, Any]:
    parent = Path(parent_dir).expanduser().resolve()
    if not parent.is_dir():
        raise FileNotFoundError(f"Parent directory not found: {parent}")

    name = display_name.strip()
    if not name:
        raise ValueError("display_name is required")

    availability = check_project_name_available(
        str(parent),
        name,
        orcai_name=orcai_name,
    )
    if not availability["available"]:
        raise ProjectNameConflictError(availability["conflicts"])

    slug = availability["slug"]
    project_dir = Path(availability["project_dir"])

    project_dir.mkdir(parents=True, exist_ok=True)
    recordings_dir(project_dir).mkdir(exist_ok=True)
    annotations_dir(project_dir).mkdir(exist_ok=True)

    now = time.time()
    project_id = str(uuid.uuid4())
    orcai = (orcai_name or slug).strip()

    soft_focus = normalize_focus(focus)
    kind = (
        focus_to_project_kind(soft_focus)
        if soft_focus is not None
        else normalize_project_kind(project_kind)
    )

    manifest = {
        "id": project_id,
        "display_name": name,
        "description": description.strip(),
        "orcai_name": orcai,
        "project_kind": kind,
        "path": str(project_dir),
        "created_at": now,
        "updated_at": now,
    }
    write_manifest(project_dir, manifest)

    try:
        with db_session() as conn:
            row = upsert_project_row(
                conn,
                id=project_id,
                path=str(project_dir),
                display_name=name,
                description=description.strip(),
                orcai_name=orcai,
                created_at=now,
                updated_at=now,
            )
            if soft_focus is not None:
                set_project_focus_row(conn, project_id, soft_focus)
    except sqlite3.IntegrityError as exc:
        # Concurrent create raced on UNIQUE path — surface as name conflict.
        availability = check_project_name_available(
            str(parent),
            name,
            orcai_name=orcai_name,
        )
        if not availability["available"]:
            raise ProjectNameConflictError(availability["conflicts"]) from exc
        raise ProjectNameConflictError(
            [{"reason": "directory", "path": str(project_dir), "display_name": name}],
        ) from exc

    if soft_focus is not None:
        _write_desktop_focus_file(project_dir, soft_focus)

    imported: list[dict[str, str]] = []
    if import_paths:
        from orcai_desktop_sidecar.wav_io import audio_import_kind

        for raw in import_paths:
            src = Path(str(raw)).expanduser().resolve()
            if not src.is_file():
                raise FileNotFoundError(f"Source file not found: {src}")
            if audio_import_kind(src) is None:
                raise ValueError(f"Unsupported audio file (WAV only): {src}")
        try:
            imported = import_recordings(project_id, import_paths)
        except Exception:  # noqa: BLE001 — rollback partial create; re-raise
            delete_project(project_id, delete_files=True)
            raise

    result = project_to_dict(row)
    result["imported"] = imported
    return result


def register_existing_project(path: str, *, display_name: str | None = None) -> dict[str, Any]:
    project_dir = Path(path).expanduser().resolve()
    if not project_dir.is_dir():
        raise FileNotFoundError(f"Directory not found: {project_dir}")

    existing = get_project_by_path(project_dir)
    if existing:
        return existing

    manifest = read_manifest(project_dir)
    now = time.time()
    created_manifest = False
    if manifest:
        project_id = str(manifest.get("id") or uuid.uuid4())
        with db_session() as conn:
            existing_id = get_project_row(conn, project_id)
        if existing_id and Path(existing_id["path"]).resolve() != project_dir:
            # Registry-only id — do not rewrite USB/shared project.json (P-07).
            project_id = str(uuid.uuid4())
        name = str(display_name or manifest.get("display_name") or project_dir.name)
        description = str(manifest.get("description") or "")
        orcai = str(manifest.get("orcai_name") or slugify(project_dir.name))
        created = float(manifest.get("created_at") or now)
    else:
        project_id = str(uuid.uuid4())
        name = display_name or project_dir.name
        description = ""
        # `orcai init DIR NAME` names the parameter file after NAME, not the folder.
        orcai = _detect_cli_orcai_name(project_dir) or slugify(project_dir.name)
        created = now
        # CLI project (`orcai init` in a terminal): no kind → soft focus is inferred
        # from artifacts and defaults to the full cycle (FR-2.14).
        manifest = {
            "id": project_id,
            "display_name": name,
            "description": description,
            "orcai_name": orcai,
            "path": str(project_dir),
            "created_at": created,
            "updated_at": now,
        }
        write_manifest(project_dir, manifest)
        created_manifest = True

    recordings_dir(project_dir).mkdir(exist_ok=True)
    annotations_dir(project_dir).mkdir(exist_ok=True)

    parent = project_dir.parent
    # Field copy / USB import: only check display_name clash (P-05), not slug/directory.
    name = _unique_register_display_name(parent, name, project_dir)
    if created_manifest:
        manifest["display_name"] = name
        write_manifest(project_dir, manifest)

    file_focus = _read_desktop_focus_file(project_dir)

    # Insert-only: never ON CONFLICT UPDATE path (P2-05 path-steal).
    for _ in range(8):
        try:
            with db_session() as conn:
                for row in list_project_rows(conn):
                    try:
                        if Path(row["path"]).expanduser().resolve() == project_dir:
                            if file_focus is not None:
                                set_project_focus_row(conn, row["id"], file_focus)
                            return project_to_dict(row)
                    except OSError:
                        continue

                existing_id = get_project_row(conn, project_id)
                if existing_id is not None:
                    try:
                        existing_path = Path(existing_id["path"]).expanduser().resolve()
                    except OSError:
                        existing_path = Path(existing_id["path"])
                    if existing_path == project_dir:
                        if file_focus is not None:
                            set_project_focus_row(conn, project_id, file_focus)
                        return project_to_dict(existing_id)
                    # Same manifest id, different folder — mint a registry-only id.
                    project_id = str(uuid.uuid4())
                    if created_manifest:
                        manifest["id"] = project_id
                        write_manifest(project_dir, manifest)

                row = insert_project_row(
                    conn,
                    id=project_id,
                    path=str(project_dir),
                    display_name=name,
                    description=description,
                    orcai_name=orcai,
                    created_at=created,
                    updated_at=now,
                )
                if file_focus is not None:
                    set_project_focus_row(conn, project_id, file_focus)
            return project_to_dict(row)
        except sqlite3.IntegrityError:
            # Concurrent register of same path, or id taken after mint — retry.
            again = get_project_by_path(project_dir)
            if again:
                return again
            project_id = str(uuid.uuid4())
            if created_manifest:
                manifest["id"] = project_id
                write_manifest(project_dir, manifest)
            continue

    raise ProjectNameConflictError(
        [{"reason": "directory", "path": str(project_dir), "display_name": name}],
    )


def update_project(
    project_id: str,
    *,
    display_name: str | None = None,
    description: str | None = None,
    auto_sync_recording_table: bool | None = None,
    predict_model: str | None = None,
    predict_model_dir: str | None = None,
    spectrogram_colormap: str | None = None,
) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    project_dir = Path(row["path"]).resolve()
    if not project_dir.exists():
        raise FileNotFoundError("Project not found")

    settings_dirty = False
    settings = _read_desktop_settings(project_dir)
    if auto_sync_recording_table is not None:
        settings["auto_sync_recording_table"] = bool(auto_sync_recording_table)
        settings_dirty = True
    if predict_model is not None:
        model = predict_model.strip()
        if not model:
            raise ValueError("predict_model cannot be empty")
        settings["predict_model"] = model
        dir_value = (predict_model_dir or "").strip()
        if dir_value:
            settings["predict_model_dir"] = dir_value
        else:
            settings.pop("predict_model_dir", None)
        settings_dirty = True
    elif predict_model_dir is not None:
        # Allow PATCH of predict_model_dir alone when model is already set (BUG-14).
        dir_value = predict_model_dir.strip()
        if dir_value:
            settings["predict_model_dir"] = dir_value
        else:
            settings.pop("predict_model_dir", None)
        settings_dirty = True
    if spectrogram_colormap is not None:
        name = spectrogram_colormap.strip().lower()
        if name not in _SPECTROGRAM_COLORMAPS:
            raise ValueError(f"Unknown spectrogram colormap: {spectrogram_colormap!r}")
        settings["spectrogram_colormap"] = name
        settings_dirty = True
    if settings_dirty:
        _write_desktop_settings(project_dir, settings)

    if display_name is None and description is None:
        project = get_project(project_id)
        if project is None:
            raise FileNotFoundError("Project not found")
        return project

    manifest = read_manifest(project_dir) or {}
    now = time.time()

    if display_name is not None:
        name = display_name.strip()
        if not name:
            raise ValueError("display_name cannot be empty")
        # Display label only — do not rename the folder or orcai_name.
        parent = project_dir.parent
        availability = check_project_name_available(
            str(parent),
            name,
            exclude_id=project_id,
            exclude_path=str(project_dir),
            display_name_only=True,
        )
        if not availability["available"]:
            raise ProjectNameConflictError(availability["conflicts"])
        row["display_name"] = name
        manifest["display_name"] = name

    if description is not None:
        row["description"] = description.strip()
        manifest["description"] = description.strip()

    row["updated_at"] = now
    manifest["updated_at"] = now
    manifest.setdefault("id", project_id)
    manifest.setdefault("path", str(project_dir))
    manifest.setdefault("orcai_name", row["orcai_name"])
    write_manifest(project_dir, manifest)

    with db_session() as conn:
        upsert_project_row(
            conn,
            id=row["id"],
            path=row["path"],
            display_name=row["display_name"],
            description=row["description"],
            orcai_name=row["orcai_name"],
            created_at=row["created_at"],
            updated_at=now,
        )
        refreshed = get_project_row(conn, project_id)
    if refreshed is None:
        raise FileNotFoundError("Project not found")
    return project_to_dict(refreshed)


def delete_project(project_id: str, *, delete_files: bool = False) -> None:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            raise FileNotFoundError("Project not found")
        project_dir = Path(row["path"])
        delete_project_row(conn, project_id)

    try:
        from orcai_desktop_sidecar.jobs import clear_jobs_history

        clear_jobs_history(project_dir=str(project_dir))
    except Exception:  # noqa: BLE001 — registry delete must succeed even if jobs fail
        with contextlib.suppress(Exception):
            clear_all_jobs_storage(project_dir=str(project_dir))

    if delete_files and project_dir.is_dir():
        shutil.rmtree(project_dir)

