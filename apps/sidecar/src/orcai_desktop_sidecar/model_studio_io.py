"""Models studio — import / export catalogues."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.models import (
    _model_dir_has_weights,
    _parameter_calls,
    _parameter_label_name,
    list_builtin_models,
)
from orcai_desktop_sidecar.model_studio_list import (
    _list_catalog_files,
    enrich_model_row,
    resolve_model_dir,
)

def import_model_directory(
    source_dir: str | Path,
    project_dir: str | Path,
    dest_name: str | None = None,
) -> dict[str, Any]:
    """Copy a valid model catalogue into ``project/models/<name>/``."""
    src = Path(source_dir).expanduser().resolve()
    root = Path(project_dir).expanduser().resolve()
    if not src.is_dir():
        raise FileNotFoundError(f"Source model directory missing: {src}")
    if not _model_dir_has_weights(src):
        raise ValueError(
            "Source is not a valid orcAI model directory "
            "(need orcai_parameter.json and *.keras / *.h5)"
        )
    name = (dest_name or _parameter_label_name(src) or src.name).strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError("Invalid destination model name")
    dest = root / "models" / name
    if dest.exists():
        raise FileExistsError(f"Model already exists: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)
    row = enrich_model_row(
        {
            "id": str(dest),
            "name": _parameter_label_name(dest),
            "path": str(dest),
            "kind": "trained",
            "calls": _parameter_calls(dest),
        },
        root,
    )
    return {"model": row}


def export_model_directory(
    model_id: str,
    dest_parent: str | Path,
    project_dir: str | Path | None = None,
    dest_name: str | None = None,
) -> dict[str, Any]:
    """Copy a project-trained model catalogue to ``dest_parent/<name>/`` for transfer."""
    root = Path(project_dir).expanduser().resolve() if project_dir else None
    model_dir = resolve_model_dir(model_id, root)
    if model_dir is None:
        raise FileNotFoundError(f"Model not found: {model_id}")
    model_dir = model_dir.resolve()
    for builtin in list_builtin_models():
        try:
            builtin_path = Path(builtin["path"]).resolve()
        except OSError:
            continue
        if builtin_path == model_dir or builtin["id"] == model_id:
            raise ValueError("Built-in models cannot be exported")
    if not _model_dir_has_weights(model_dir):
        raise ValueError(
            "Source is not a valid orcAI model directory "
            "(need orcai_parameter.json and *.keras / *.h5)"
        )
    parent = Path(dest_parent).expanduser().resolve()
    if not parent.is_dir():
        raise FileNotFoundError(f"Destination folder missing: {parent}")
    name = (dest_name or _parameter_label_name(model_dir) or model_dir.name).strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError("Invalid destination model name")
    dest = parent / name
    if dest.exists():
        raise FileExistsError(f"Model already exists: {dest}")
    shutil.copytree(model_dir, dest)
    return {
        "path": str(dest),
        "name": _parameter_label_name(dest),
        "files": _list_catalog_files(dest),
    }
