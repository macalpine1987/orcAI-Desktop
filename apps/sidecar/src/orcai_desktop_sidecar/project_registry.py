"""Desktop project registry, manifests, and recording file operations."""

from __future__ import annotations

import contextlib
import json
import os
import re
import shutil
import sqlite3
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.store import (
    clear_all_jobs_storage,
    db_session,
    delete_project_row,
    get_project_focus_row,
    get_project_row,
    insert_project_row,
    list_project_rows,
    set_project_focus_row,
    upsert_project_row,
)

MANIFEST_FILENAME = "project.json"
RECORDINGS_DIRNAME = "recordings"
ANNOTATIONS_DIRNAME = "annotations"
TABLE_FILENAME = "recording_table.csv"
WAV_SUFFIX = ".wav"

PROJECT_KIND_RECOGNITION = "recognition"
PROJECT_KIND_TRAINING = "training"
VALID_PROJECT_KINDS = frozenset({PROJECT_KIND_RECOGNITION, PROJECT_KIND_TRAINING})


FOCUS_RECOGNITION = "recognition"
FOCUS_TRAINING = "training"
FOCUS_FULL = "full"
VALID_FOCUSES = frozenset({FOCUS_RECOGNITION, FOCUS_TRAINING, FOCUS_FULL})


def normalize_project_kind(raw: str | None) -> str:
    if raw == PROJECT_KIND_TRAINING:
        return PROJECT_KIND_TRAINING
    return PROJECT_KIND_RECOGNITION


def normalize_focus(raw: str | None) -> str | None:
    """Soft focus value or None when unknown (FR-2.14)."""
    if raw in VALID_FOCUSES:
        return str(raw)
    return None


def focus_to_project_kind(focus: str | None) -> str:
    """Legacy manifest kind derived from focus (kept for older builds)."""
    return PROJECT_KIND_TRAINING if focus == FOCUS_TRAINING else PROJECT_KIND_RECOGNITION


def get_stored_focus(project_id: str) -> str | None:
    with db_session() as conn:
        return normalize_focus(get_project_focus_row(conn, project_id))


def _desktop_meta_dir(project_dir: Path) -> Path:
    """Portable Desktop metadata beside the project (travels on USB; not orcAI JSON)."""
    return Path(project_dir) / ".orcai-desktop"


def _desktop_focus_path(project_dir: Path) -> Path:
    return _desktop_meta_dir(project_dir) / "desktop_focus.json"


def _read_desktop_focus_file(project_dir: Path) -> str | None:
    path = _desktop_focus_path(project_dir)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    return normalize_focus(data.get("focus"))


def _write_desktop_focus_file(project_dir: Path, focus: str) -> None:
    meta = _desktop_meta_dir(project_dir)
    meta.mkdir(parents=True, exist_ok=True)
    path = _desktop_focus_path(project_dir)
    payload = json.dumps({"focus": focus}, indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_text(payload, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        if tmp.is_file():
            with contextlib.suppress(OSError):
                tmp.unlink()


def _desktop_settings_path(project_dir: Path) -> Path:
    return _desktop_meta_dir(project_dir) / "desktop_settings.json"


def _read_desktop_settings(project_dir: Path) -> dict[str, Any]:
    path = _desktop_settings_path(project_dir)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_desktop_settings(project_dir: Path, settings: dict[str, Any]) -> None:
    meta = _desktop_meta_dir(project_dir)
    meta.mkdir(parents=True, exist_ok=True)
    path = _desktop_settings_path(project_dir)
    payload = json.dumps(settings, indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_text(payload, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        if tmp.is_file():
            with contextlib.suppress(OSError):
                tmp.unlink()


def get_auto_sync_recording_table(project_dir: Path | str) -> bool:
    """Per-project preference; default True (auto create-recording-table)."""
    settings = _read_desktop_settings(Path(project_dir))
    return bool(settings.get("auto_sync_recording_table", True))


_SPECTROGRAM_COLORMAPS = frozenset(
    {"inferno", "viridis", "plasma", "magma", "cividis", "gray"}
)


def get_spectrogram_colormap(project_dir: Path | str) -> str | None:
    """Per-project analysis colormap. None means the UI default (Greys)."""
    settings = _read_desktop_settings(Path(project_dir))
    raw = settings.get("spectrogram_colormap")
    if not isinstance(raw, str):
        return None
    name = raw.strip().lower()
    return name if name in _SPECTROGRAM_COLORMAPS else None


def get_predict_model_settings(
    project_dir: Path | str,
) -> tuple[str | None, str | None]:
    """Per-project selected predict model (id) and optional trained model dir."""
    settings = _read_desktop_settings(Path(project_dir))
    raw_model = settings.get("predict_model")
    model = str(raw_model).strip() if isinstance(raw_model, str) else ""
    raw_dir = settings.get("predict_model_dir")
    model_dir = str(raw_dir).strip() if isinstance(raw_dir, str) else ""
    return (model or None, model_dir or None)


def set_auto_sync_recording_table(project_id: str, enabled: bool) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")
    project_dir = Path(row["path"])
    if not project_dir.is_dir():
        raise FileNotFoundError("Project not found")
    settings = _read_desktop_settings(project_dir)
    settings["auto_sync_recording_table"] = bool(enabled)
    _write_desktop_settings(project_dir, settings)
    project = get_project(project_id)
    assert project is not None
    return project


def set_project_focus(project_id: str, focus: str) -> dict[str, Any]:
    normalized = normalize_focus(focus)
    if normalized is None:
        raise ValueError(f"Unknown focus: {focus!r}")
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            raise FileNotFoundError("Project not found")
        project_dir = Path(row["path"])
    # Portable file first, then SQLite (P2-10) — avoid DB-ahead-of-disk drift.
    if project_dir.is_dir():
        _write_desktop_focus_file(project_dir, normalized)
    with db_session() as conn:
        if not get_project_row(conn, project_id):
            raise FileNotFoundError("Project not found")
        set_project_focus_row(conn, project_id, normalized)
    project = get_project(project_id)
    assert project is not None
    return project


def project_kind_from_manifest(manifest: dict[str, Any] | None) -> str:
    if not manifest:
        return PROJECT_KIND_RECOGNITION
    raw = manifest.get("project_kind")
    return normalize_project_kind(str(raw) if raw is not None else None)


class ProjectNameConflictError(Exception):
    """Raised when display name or folder slug collides under the parent directory."""

    def __init__(self, conflicts: list[dict[str, Any]]) -> None:
        self.conflicts = conflicts
        super().__init__("project_name_conflict")


def slugify(name: str) -> str:
    raw = name.strip().lower()
    raw = re.sub(r"[^\w]+", "_", raw, flags=re.UNICODE)
    raw = re.sub(r"_+", "_", raw).strip("_")
    return raw or "project"


def recordings_dir(project_dir: Path) -> Path:
    return project_dir / RECORDINGS_DIRNAME


def annotations_dir(project_dir: Path) -> Path:
    return project_dir / ANNOTATIONS_DIRNAME


def recording_table_path(project_dir: Path) -> Path:
    return project_dir / TABLE_FILENAME


def discover_recording_table_paths(project_dir: Path) -> list[Path]:
    """All recording_table.csv files under a project (canonical, legacy, nested)."""
    root = project_dir.resolve()
    seen: set[Path] = set()
    ordered: list[Path] = []

    def add(path: Path) -> None:
        resolved = path.resolve()
        if resolved in seen or not path.is_file():
            return
        seen.add(resolved)
        ordered.append(path)

    add(recording_table_path(root))
    rec = recordings_dir(root)
    add(rec / TABLE_FILENAME)
    if root.is_dir():
        for path in root.rglob(TABLE_FILENAME):
            if _rel_is_hidden(path, root):
                continue
            add(path)
    return ordered


def resolve_recording_table_path(project_dir: Path) -> Path | None:
    tables = discover_recording_table_paths(project_dir)
    if not tables:
        return None
    canonical = recording_table_path(project_dir).resolve()
    for path in tables:
        if path.resolve() == canonical:
            return path
    legacy = (recordings_dir(project_dir) / TABLE_FILENAME).resolve()
    for path in tables:
        if path.resolve() == legacy:
            return path
    return tables[0]


def remove_project_recording_tables(project_dir: Path) -> list[str]:
    removed: list[str] = []
    for path in discover_recording_table_paths(project_dir):
        path.unlink(missing_ok=True)
        removed.append(str(path))
    return removed


def manifest_path(project_dir: Path) -> Path:
    return project_dir / MANIFEST_FILENAME


def _validate_manifest(data: dict[str, Any], path: Path) -> dict[str, Any]:
    for key in ("id", "display_name", "orcai_name", "path"):
        value = data.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"Invalid manifest field {key!r}: {path}")
    for key in ("created_at", "updated_at"):
        value = data.get(key)
        if value is not None and not isinstance(value, (int, float)):
            raise ValueError(f"Invalid manifest field {key!r}: {path}")
    if "description" in data and not isinstance(data["description"], str):
        raise ValueError(f"Invalid manifest field description: {path}")
    if "project_kind" in data:
        kind = data.get("project_kind")
        if kind is not None and str(kind) not in VALID_PROJECT_KINDS:
            raise ValueError(f"Invalid manifest field project_kind: {path}")
    return data


def read_manifest(project_dir: Path) -> dict[str, Any] | None:
    path = manifest_path(project_dir)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ValueError(f"Invalid manifest: {path}") from exc
    if not isinstance(data, dict):
        raise TypeError(f"Invalid manifest: {path}")
    return _validate_manifest(data, path)


def write_manifest(project_dir: Path, data: dict[str, Any]) -> dict[str, Any]:
    project_dir.mkdir(parents=True, exist_ok=True)
    path = manifest_path(project_dir)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return data


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


def _is_initialized(project_dir: Path, orcai_name: str) -> bool:
    param = project_dir / f"{orcai_name}_orcai_parameter.json"
    return param.is_file()


_PARAMETER_SUFFIX = "_orcai_parameter.json"


def _detect_cli_orcai_name(project_dir: Path) -> str | None:
    """orcAI project name from an existing ``<name>_orcai_parameter.json`` (CLI init).

    If several parameter files exist, prefer one matching the folder name;
    otherwise raise so the caller can ask the user.
    """
    candidates = sorted(
        p.name[: -len(_PARAMETER_SUFFIX)]
        for p in project_dir.glob(f"*{_PARAMETER_SUFFIX}")
        if p.is_file() and len(p.name) > len(_PARAMETER_SUFFIX)
    )
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    folder = project_dir.name
    for name in candidates:
        if name.casefold() == folder.casefold() or slugify(name) == slugify(folder):
            return name
    raise ValueError(
        "Multiple orcAI parameter files found "
        f"({', '.join(f'{c}{_PARAMETER_SUFFIX}' for c in candidates)}); "
        "open the folder after choosing which project name to keep, or remove extras."
    )


def _looks_like_project_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    if (path / MANIFEST_FILENAME).is_file():
        return True
    if (path / RECORDINGS_DIRNAME).is_dir():
        return True
    return any(path.glob(f"*{_PARAMETER_SUFFIX}"))


def _prune_missing_project_rows(conn) -> None:
    """Drop registry rows whose folder is gone (USB unplug, moved path, local delete)."""
    for row in list_project_rows(conn):
        # File-in-place-of-dir must also prune (P2-11).
        if not Path(row["path"]).is_dir():
            delete_project_row(conn, row["id"])


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
        except Exception:
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


def _unique_register_display_name(
    parent: Path,
    display_name: str,
    project_dir: Path,
) -> str:
    """Pick a free display name for register_existing (allow USB copies)."""
    base = display_name.strip() or project_dir.name
    availability = check_project_name_available(
        str(parent),
        base,
        exclude_path=str(project_dir),
        display_name_only=True,
    )
    if availability["available"]:
        return base
    folder = project_dir.name
    candidates = [
        f"{base} ({folder})" if folder.casefold() != base.casefold() else f"{base} (imported)",
        *(f"{base} ({n})" for n in range(2, 100)),
    ]
    for candidate in candidates:
        check = check_project_name_available(
            str(parent),
            candidate,
            exclude_path=str(project_dir),
            display_name_only=True,
        )
        if check["available"]:
            return candidate
    raise ProjectNameConflictError(availability["conflicts"])


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
        assert project is not None
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
    assert refreshed is not None
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


def list_wav_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    found: list[Path] = []
    for path in directory.rglob("*"):
        if not path.is_file() or path.suffix.lower() != WAV_SUFFIX:
            continue
        if any(part.startswith(".") for part in path.relative_to(directory).parts):
            continue
        found.append(path)
    return sorted(found, key=lambda p: str(p.relative_to(directory)).lower())


def resolve_recording_file(rec_dir: Path, name: str) -> Path | None:
    """Map a UI/table recording id to a WAV on disk.

    The Projects table uses the recording *stem* (CSV column / wav.stem).
    Import/API callers may pass the full filename (``a.wav``). Accept both.
    """
    base = Path(name).name.strip()
    if not base:
        return None
    direct = rec_dir / base
    if direct.is_file():
        return direct
    stem = Path(base).stem if Path(base).suffix else base
    matches = [p for p in list_wav_files(rec_dir) if p.stem == stem]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return sorted(matches, key=lambda p: p.name.lower())[0]
    candidate = rec_dir / f"{stem}{WAV_SUFFIX}"
    return candidate if candidate.is_file() else None


def list_project_recordings(project_id: str) -> list[dict[str, Any]]:
    from orcai_desktop_sidecar.wav_io import read_wav_meta

    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    rec_dir = Path(project["recordings_dir"])
    items: list[dict[str, Any]] = []
    for wav in list_wav_files(rec_dir):
        stat = wav.stat()
        entry: dict[str, Any] = {
            "name": wav.name,
            "path": str(wav.resolve()),
            "rel_path": wav.name,
            "size_bytes": stat.st_size,
            "modified_at": stat.st_mtime,
            "sample_rate_hz": None,
            "bit_depth": None,
        }
        try:
            meta = read_wav_meta(wav)
            entry["sample_rate_hz"] = meta["sample_rate_hz"]
            entry["bit_depth"] = meta["bit_depth"]
            entry["duration_sec"] = meta["duration_sec"]
        except (OSError, ValueError):
            entry["meta_error"] = True
        items.append(entry)
    return items


def normalize_wav_extensions(directory: Path) -> int:
    """Rename ``.WAV`` / mixed-case suffixes to ``.wav`` so orcAI's glob finds them."""
    if not directory.is_dir():
        return 0
    renamed = 0
    for path in list(directory.rglob("*")):
        if not path.is_file() or path.suffix.lower() != WAV_SUFFIX:
            continue
        if path.suffix == WAV_SUFFIX:
            continue
        dest = path.with_suffix(WAV_SUFFIX)
        if dest.exists():
            continue
        try:
            path.rename(dest)
        except OSError:
            continue
        renamed += 1
    return renamed


def _unique_destination(dest_dir: Path, filename: str) -> Path:
    base = Path(filename).name
    if Path(base).suffix.lower() == WAV_SUFFIX:
        base = f"{Path(base).stem}{WAV_SUFFIX}"
    candidate = dest_dir / base
    if not candidate.exists():
        return candidate
    stem = Path(base).stem
    suffix = Path(base).suffix
    n = 1
    while True:
        candidate = dest_dir / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def import_audio_path(
    project_id: str,
    src: str | Path,
    *,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Import one WAV file (copy) into project recordings."""
    from orcai_desktop_sidecar.wav_io import (
        IMPORT_AUDIO_SUFFIXES,
        audio_import_kind,
        validate_wav_for_project,
    )

    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    src_path = Path(src).expanduser().resolve()
    if not src_path.is_file():
        raise FileNotFoundError(f"Source file not found: {src_path}")
    if src_path.suffix.lower() not in IMPORT_AUDIO_SUFFIXES:
        raise ValueError(
            f"Unsupported audio file: {src_path} (use {', '.join(sorted(IMPORT_AUDIO_SUFFIXES))})"
        )

    kind = audio_import_kind(src_path)
    if kind is None:
        raise ValueError(f"Unsupported audio file: {src_path}")

    project_dir = Path(row["path"]).resolve()
    dest_dir = recordings_dir(project_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    if log:
        log("Copying WAV…")
    meta = validate_wav_for_project(src_path)
    dest = _unique_destination(dest_dir, src_path.name)
    shutil.copy2(src_path, dest)

    _touch_project(project_id)
    return {
        "source": str(src_path),
        "dest": str(dest),
        "name": dest.name,
        "kind": kind,
        "sample_rate_hz": meta["sample_rate_hz"],
        "bit_depth": meta["bit_depth"],
    }


def import_recordings(project_id: str, source_paths: list[str]) -> list[dict[str, str]]:
    # Stable alphabetical import (drag-drop / multi-select often arrive unsorted).
    ordered = sorted(
        source_paths,
        key=lambda p: Path(p).name.casefold(),
    )
    imported: list[dict[str, str]] = []
    copied_dests: list[Path] = []
    try:
        for raw in ordered:
            row = import_audio_path(project_id, raw)
            copied_dests.append(Path(row["dest"]))
            imported.append(
                {
                    "source": row["source"],
                    "dest": row["dest"],
                    "name": row["name"],
                    "sample_rate_hz": row["sample_rate_hz"],
                    "bit_depth": row["bit_depth"],
                }
            )
    except Exception:
        for dest in copied_dests:
            try:
                dest.unlink(missing_ok=True)
            except OSError:
                pass
        raise
    return imported


def delete_recordings(
    project_id: str,
    *,
    filenames: list[str] | None = None,
    delete_all: bool = False,
) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    rec_dir = recordings_dir(Path(row["path"]).resolve())
    if not rec_dir.is_dir():
        return {"deleted": [], "count": 0}

    skipped: list[str] = []
    if delete_all:
        targets = list_wav_files(rec_dir)
    elif filenames:
        targets = []
        seen: set[str] = set()
        for name in filenames:
            path = resolve_recording_file(rec_dir, name)
            if path is None:
                skipped.append(Path(name).name)
                continue
            key = str(path.resolve())
            if key in seen:
                continue
            seen.add(key)
            targets.append(path)
    else:
        raise ValueError("Provide filenames or delete_all=true")

    deleted: list[str] = []
    for path in targets:
        path.unlink(missing_ok=True)
        deleted.append(path.name)

    project_dir = Path(row["path"]).resolve()
    remaining_wavs = (
        len(list_wav_files(rec_dir)) if rec_dir.is_dir() else 0
    )
    removed_tables: list[str] = []
    if delete_all or remaining_wavs == 0:
        removed_tables = remove_project_recording_tables(project_dir)

    _touch_project(project_id)
    result: dict[str, Any] = {"deleted": deleted, "count": len(deleted)}
    if skipped:
        result["skipped"] = skipped
    if removed_tables:
        result["removed_tables"] = removed_tables
    return result


def _touch_project(project_id: str) -> None:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            return
        now = time.time()
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
    project_dir = Path(row["path"])
    manifest = read_manifest(project_dir)
    if manifest:
        manifest["updated_at"] = now
        write_manifest(project_dir, manifest)


def sync_table_job_params(
    project_id: str,
    *,
    overwrite: bool = False,
    update_table: bool = False,
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

    params: dict[str, Any] = {
        "base_dir_recording": str(rec),
        "output_path": str(table_path),
        "base_dir_annotation": str(ann) if ann.is_dir() else None,
        "default_channel": 1,
        "overwrite": overwrite,
        "update_table": resolved_update,
        "update_paths": True,
        "verbosity": 2,
    }
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


ReadinessState = str  # "ready" | "needed" | "empty"
ProjectFocus = str  # "recognition" | "training" | "full"


def _rel_is_hidden(path: Path, root: Path) -> bool:
    """Hidden only inside ``root``. A parent like ``~/.cursor`` must not hide the project."""
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        rel = path
    return any(part.startswith(".") for part in rel.parts)


def _is_manual_annotation_label(path: Path) -> bool:
    name = path.name.lower()
    if not name.endswith(".txt"):
        return False
    return not (name.endswith("_predicted.txt") or name.endswith("_filtered.txt"))


def _count_annotation_label_files(project_dir: Path) -> int:
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return 0
    count = 0
    for path in ann.rglob("*.txt"):
        if _rel_is_hidden(path, ann):
            continue
        if path.is_file() and _is_manual_annotation_label(path):
            count += 1
    return count


def _count_paired_annotation_label_files(project_dir: Path) -> int:
    """Manual ``.txt`` labels whose stem matches a WAV in ``recordings/``.

    Nested files count (same walk as the training gate). Predicted and filtered
    exports do not. One stem counts once.
    """
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return 0
    stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    if not stems:
        return 0
    seen: set[str] = set()
    for path in ann.rglob("*.txt"):
        if not path.is_file() or _rel_is_hidden(path, ann):
            continue
        if not _is_manual_annotation_label(path) or path.stem not in stems:
            continue
        seen.add(path.stem)
    return len(seen)


def _newest_manual_annotation_mtime(project_dir: Path) -> float | None:
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return None
    newest: float | None = None
    for path in ann.iterdir():
        if not (path.is_file() and _is_manual_annotation_label(path)):
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        newest = mtime if newest is None else max(newest, mtime)
    return newest


def _count_predicted_labels(project_dir: Path) -> int:
    count = 0
    for pattern in ("*_predicted.txt",):
        for path in project_dir.rglob(pattern):
            if _rel_is_hidden(path, project_dir):
                continue
            if path.is_file():
                count += 1
    return count


def _count_tvt_dataset_files(project_dir: Path) -> int:
    tvt = project_dir / "tvt_data"
    if not tvt.is_dir():
        return 0
    return sum(
        1
        for path in tvt.rglob("*")
        if path.is_file() and not _rel_is_hidden(path, tvt)
    )


def _count_trained_model_checkpoints(project_dir: Path) -> int:
    models_dir = project_dir / "models"
    if not models_dir.is_dir():
        return 0
    return sum(
        1
        for path in models_dir.rglob("*.keras")
        if path.is_file() and not _rel_is_hidden(path, models_dir)
    )


def _primary_trained_model_name(project_dir: Path) -> str | None:
    models_dir = project_dir / "models"
    if not models_dir.is_dir():
        return None
    candidates: list[Path] = []
    for path in models_dir.rglob("*.keras"):
        if path.is_file() and not _rel_is_hidden(path, models_dir):
            candidates.append(path)
    if not candidates:
        return None
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    return newest.parent.name if newest.parent != models_dir else newest.stem


def _recording_table_row_count(table_path: Path) -> int | None:
    import csv

    try:
        with table_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            if next(reader, None) is None:
                return 0
            return sum(1 for _ in reader)
    except (OSError, UnicodeDecodeError, csv.Error):
        return None


def _parse_recording_table_stats(
    table_path: Path | None,
    project_dir: Path | None = None,
) -> dict[str, int]:
    """Row/annotation counts from recording_table.csv when present."""
    empty = {"table_rows": 0, "annotated_rows": 0}
    if table_path is None or not table_path.is_file():
        return empty

    import csv

    try:
        with table_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
    except (OSError, UnicodeDecodeError, csv.Error):
        return empty

    has_path_column = bool(rows) and "rel_annotation_path" in rows[0]
    ann_dir = annotations_dir(project_dir or table_path.parent)
    annotated = 0
    for row in rows:
        rel_ann = (row.get("rel_annotation_path") or "").strip()
        if rel_ann:
            # A path left behind by a deleted .txt does not count.
            base = (row.get("base_dir_annotation") or "").strip()
            if (base and (Path(base) / rel_ann).is_file()) or (
                ann_dir / Path(rel_ann).name
            ).is_file():
                annotated += 1
            continue
        if has_path_column:
            # Class cells of an unannotated row are masks, not annotations.
            continue
        # Legacy rows may only expose class columns.
        for key, value in row.items():
            if not key or key in {
                "recording",
                "channel",
                "duplicate",
                "base_dir_recording",
                "rel_recording_path",
                "base_dir_annotation",
                "rel_annotation_path",
            }:
                continue
            if str(value).strip():
                annotated += 1
                break

    return {"table_rows": len(rows), "annotated_rows": annotated}


def _recording_table_sync_status(
    project_dir: Path,
    *,
    wav_count: int,
    table_path: Path | None,
    table_rows: int,
) -> str:
    """Returns missing | stale | current."""
    if table_path is None or not table_path.is_file():
        return "missing"
    if wav_count == 0 and table_rows == 0:
        return "current"
    if table_rows == 0 and wav_count > 0:
        return "stale"
    if table_rows != wav_count:
        return "stale"
    rec_dir = recordings_dir(project_dir)
    wavs = list_wav_files(rec_dir)
    if wavs:
        newest_wav = max(p.stat().st_mtime for p in wavs)
        if newest_wav > table_path.stat().st_mtime + 1.0:
            return "stale"
    newest_ann = _newest_manual_annotation_mtime(project_dir)
    if newest_ann is not None and newest_ann > table_path.stat().st_mtime + 1.0:
        return "stale"
    return "current"


def _readiness_recordings(wav_count: int, table_sync: str) -> ReadinessState:
    if wav_count == 0 and table_sync == "missing":
        return "empty"
    if table_sync in ("missing", "stale"):
        return "needed"
    if wav_count > 0 or table_sync == "current":
        return "ready"
    return "empty"


def _readiness_annotations(total: int, annotated: int) -> ReadinessState:
    if annotated > 0:
        return "ready"
    if total > 0:
        return "needed"
    return "empty"


def _readiness_predict(total: int, predicted_count: int) -> ReadinessState:
    if predicted_count > 0:
        return "ready"
    if total > 0:
        return "needed"
    return "empty"


def _readiness_datasets(
    annotated_count: int,
    predicted_count: int,
    dataset_files: int,
) -> ReadinessState:
    """Datasets needed when annotations (training) or predictions exist (BUG-P-06)."""
    if dataset_files > 0:
        return "ready"
    if annotated_count > 0 or predicted_count > 0:
        return "needed"
    return "empty"


def _readiness_model(dataset_files: int, model_checkpoints: int) -> ReadinessState:
    if model_checkpoints > 0:
        return "ready"
    if dataset_files > 0:
        return "needed"
    return "empty"


def _infer_project_focus(
    project_kind: str,
    *,
    predicted_count: int,
    dataset_files: int,
    model_checkpoints: int,
    kind_explicit: bool = True,
) -> ProjectFocus:
    """Soft focus from artifacts; CLI projects without a kind default to full cycle."""
    if kind_explicit and project_kind == PROJECT_KIND_TRAINING:
        return FOCUS_TRAINING
    has_training = dataset_files > 0 or model_checkpoints > 0
    if has_training and predicted_count > 0:
        return FOCUS_FULL
    if has_training:
        return FOCUS_TRAINING
    if predicted_count > 0:
        return FOCUS_RECOGNITION
    return FOCUS_RECOGNITION if kind_explicit else FOCUS_FULL


def _compute_next_actions(
    readiness: dict[str, ReadinessState],
    *,
    table_sync: str,
) -> list[str]:
    actions: list[str] = []
    if table_sync in ("missing", "stale"):
        actions.append("sync_table")
    if readiness["recordings"] == "ready" and readiness["predict"] in ("needed", "ready"):
        if readiness["predict"] == "needed":
            actions.append("predict")
        elif readiness["predict"] == "ready":
            actions.append("filter")
    if readiness["annotations"] == "needed":
        actions.append("annotate")
    # Training path: datasets from annotations, not only after predict (BUG-P-06).
    if readiness["datasets"] == "needed" and (
        readiness["annotations"] == "ready" or readiness["predict"] == "ready"
    ):
        actions.append("create_tvt")
    if readiness["model"] == "needed" and readiness["datasets"] == "ready":
        actions.append("train")
    if readiness["predict"] == "ready":
        actions.append("results")
    return actions


def compute_project_summary(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")

    project_dir = Path(project["path"]).resolve()
    rec_dir = recordings_dir(project_dir)
    wav_count = len(list_wav_files(rec_dir)) if rec_dir.is_dir() else 0
    table_path = resolve_recording_table_path(project_dir)
    table_stats = _parse_recording_table_stats(table_path, project_dir)
    table_rows = table_stats["table_rows"]
    annotated_rows = table_stats["annotated_rows"]

    recordings_metric = table_rows if table_rows > 0 else wav_count
    disk_paired_ann = _count_paired_annotation_label_files(project_dir)
    # Prefer CSV annotation column, but count on-disk paired labels too (BUG-05).
    if table_rows > 0:
        annotations_metric = max(annotated_rows, disk_paired_ann)
    else:
        annotations_metric = disk_paired_ann or _count_annotation_label_files(project_dir)
    predicted_count = _count_predicted_labels(project_dir)
    dataset_files = _count_tvt_dataset_files(project_dir)
    model_checkpoints = _count_trained_model_checkpoints(project_dir)
    primary_model = _primary_trained_model_name(project_dir)

    table_sync = _recording_table_sync_status(
        project_dir,
        wav_count=wav_count,
        table_path=table_path,
        table_rows=table_rows,
    )

    readiness = {
        "recordings": _readiness_recordings(wav_count, table_sync),
        "annotations": _readiness_annotations(recordings_metric, annotations_metric),
        "predict": _readiness_predict(recordings_metric, predicted_count),
        "datasets": _readiness_datasets(
            annotations_metric, predicted_count, dataset_files
        ),
        "model": _readiness_model(dataset_files, model_checkpoints),
    }

    stored_focus = project.get("focus")
    manifest = project.get("manifest") or {}
    focus = stored_focus or _infer_project_focus(
        project["project_kind"],
        predicted_count=predicted_count,
        dataset_files=dataset_files,
        model_checkpoints=model_checkpoints,
        kind_explicit=bool(manifest.get("project_kind")),
    )

    # Lazy import: project_studio imports this module at load time.
    # Never fail the whole summary if health scan errors (advisory only).
    data_health: dict[str, Any] = {
        "table_stale": False,
        "missing_wav": 0,
        "unpaired_ann": 0,
        "ann_gap": 0,
    }
    with contextlib.suppress(Exception):
        from orcai_desktop_sidecar.project_studio import compute_data_health

        data_health = compute_data_health(
            project_dir,
            table_sync=table_sync,
            wav_count=wav_count,
        )

    return {
        "project_id": project_id,
        "display_name": project["display_name"],
        "project_kind": project["project_kind"],
        "focus": focus,
        "focus_source": "stored" if stored_focus else "inferred",
        "metrics": {
            "recordings": recordings_metric,
            "annotations": annotations_metric,
            "predicted": predicted_count,
            "trained_models": model_checkpoints,
            "recordings_total": recordings_metric,
            "annotations_total": recordings_metric,
        },
        "primary_model_name": primary_model,
        "recording_table": {
            "path": str(table_path) if table_path is not None else None,
            "sync_status": table_sync,
        },
        "auto_sync_recording_table": bool(
            project.get("auto_sync_recording_table", True)
        ),
        "predict_model": project.get("predict_model"),
        "predict_model_dir": project.get("predict_model_dir"),
        "readiness": readiness,
        "readiness_lines": {
            "recordings": {
                "state": readiness["recordings"],
                "wav_count": wav_count,
                "table_rows": table_rows,
            },
            "annotations": {
                "state": readiness["annotations"],
                "annotated": annotations_metric,
                "total": recordings_metric,
                # Disk .txt paired to a WAV. The training wizard uses this, not the
                # CSV-merged metric above (a rel path without a file is not a label).
                "paired_files": disk_paired_ann,
            },
            "predict": {
                "state": readiness["predict"],
                "predicted": predicted_count,
                "total": recordings_metric,
            },
            "datasets": {
                "state": readiness["datasets"],
                "file_count": dataset_files,
                "has_tvt_dir": (project_dir / "tvt_data").is_dir(),
            },
            "model": {
                "state": readiness["model"],
                "checkpoint_count": model_checkpoints,
                "model_name": primary_model,
            },
        },
        "data_health": data_health,
        "next_actions": _compute_next_actions(readiness, table_sync=table_sync),
    }
