"""Project path helpers and manifests (extracted from project_registry)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

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

_PARAMETER_SUFFIX = "_orcai_parameter.json"


def _rel_is_hidden(path: Path, root: Path) -> bool:
    """Hidden only inside ``root``. A parent like ``~/.cursor`` must not hide the project."""
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        rel = path
    return any(part.startswith(".") for part in rel.parts)


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



def _looks_like_project_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    if (path / MANIFEST_FILENAME).is_file():
        return True
    if (path / RECORDINGS_DIRNAME).is_dir():
        return True
    return any(path.glob(f"*{_PARAMETER_SUFFIX}"))
