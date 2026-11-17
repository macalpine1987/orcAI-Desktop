"""Desktop focus / settings files (extracted from project_registry)."""

from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import (
    FOCUS_FULL,
    FOCUS_RECOGNITION,
    FOCUS_TRAINING,
    PROJECT_KIND_RECOGNITION,
    PROJECT_KIND_TRAINING,
    VALID_FOCUSES,
)
from orcai_desktop_sidecar.store import (
    db_session,
    get_project_focus_row,
    get_project_row,
    set_project_focus_row,
)


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




def set_project_focus(project_id: str, focus: str) -> dict[str, Any]:
    normalized = normalize_focus(focus)
    if normalized is None:
        raise ValueError(f"Unknown focus: {focus!r}")
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            raise FileNotFoundError("Project not found")
        project_dir = Path(row["path"])
    if project_dir.is_dir():
        _write_desktop_focus_file(project_dir, normalized)
    with db_session() as conn:
        if not get_project_row(conn, project_id):
            raise FileNotFoundError("Project not found")
        set_project_focus_row(conn, project_id, normalized)
    from orcai_desktop_sidecar.project_crud import get_project
    project = get_project(project_id)
    if project is None:
        raise FileNotFoundError("Project not found")
    return project


def project_kind_from_manifest(manifest: dict[str, Any] | None) -> str:
    if not manifest:
        return PROJECT_KIND_RECOGNITION
    raw = manifest.get("project_kind")
    return normalize_project_kind(str(raw) if raw is not None else None)

