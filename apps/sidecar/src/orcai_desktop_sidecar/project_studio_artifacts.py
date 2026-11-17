"""Artifacts + parameters studio ops (extracted from project_studio)."""

from __future__ import annotations

import time
import os
import json
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_registry import get_project
from orcai_desktop_sidecar.project_studio_table import (
    _require_project,
    parameter_json_path,
)
from orcai_desktop_sidecar.project_studio_helpers import (
    _dir_stats,
    _is_hidden,
    _read_json_file,
    orcai_parameter_defaults,
)

ARTIFACT_DIRS: tuple[str, ...] = (
    "spectrograms",
    "label_arrays",
    "tvt_data",
    "models",
    "predictions",
)

def list_artifacts(project_id: str) -> dict[str, Any]:
    """Spectrograms / label arrays / datasets / models / predictions (FR-2.8)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    items: list[dict[str, Any]] = []
    for name in ARTIFACT_DIRS:
        path = project_dir / name
        exists = path.is_dir()
        files, size, newest = _dir_stats(path) if exists else (0, 0, None)
        items.append(
            {
                "name": name,
                "path": str(path),
                "exists": exists,
                "file_count": files,
                "size_bytes": size,
                "updated_at": newest,
            }
        )
    return {
        "project_id": project_id,
        "project_dir": str(project_dir),
        "items": items,
        "present_count": sum(1 for i in items if i["exists"] and i["file_count"] > 0),
    }


# --------------------------------------------------------------------------- parameters


def validate_parameters_text(text: str) -> dict[str, Any]:
    """Validate an ``<name>_orcai_parameter.json`` document (FR-2.9)."""
    errors: list[str] = []
    warnings: list[str] = []
    excluded_calls: list[str] = []
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return {
            "valid": False,
            "errors": [f"JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})"],
            "warnings": [],
            "excluded_calls": [],
        }
    if not isinstance(data, dict):
        return {
            "valid": False,
            "errors": ["Top level must be a JSON object"],
            "warnings": [],
            "excluded_calls": [],
        }

    defaults = orcai_parameter_defaults()
    for key in defaults:
        if key not in data:
            errors.append(f"Missing key: {key}")
    for key in data:
        if key not in defaults:
            warnings.append(f"Unknown key (ignored by orcAI): {key}")

    calls = data.get("calls")
    if "calls" in data:
        if not isinstance(calls, list) or not calls:
            errors.append("calls must be a non-empty list of class names")
        elif not all(isinstance(c, str) and c.strip() for c in calls):
            errors.append("calls must contain only non-empty strings")
        elif len(set(calls)) != len(calls):
            errors.append("calls contains duplicates")
        else:
            default_calls = [str(c) for c in defaults.get("calls") or []]
            for missing in default_calls:
                if missing not in calls:
                    # Structured list for UI (triangle next to «Валидно»); not a warning dump.
                    excluded_calls.append(missing)

    spec = data.get("spectrogram")
    if "spectrogram" in data:
        if not isinstance(spec, dict):
            errors.append("spectrogram must be an object")
        else:
            for num_key in ("sampling_rate", "nfft", "n_overlap"):
                value = spec.get(num_key)
                if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
                    errors.append(f"spectrogram.{num_key} must be a positive integer")
            fr = spec.get("freq_range")
            if (
                not isinstance(fr, list)
                or len(fr) != 2
                or not all(isinstance(v, (int, float)) for v in fr)
                or fr[0] >= fr[1]
            ):
                errors.append("spectrogram.freq_range must be [low, high] with low < high")
            # n_overlap is the STFT hop. A hop larger than nfft is valid,
            # the same as reject_spectrogram_parameter before a job starts.

    name = data.get("name")
    if "name" in data and (not isinstance(name, str) or not name.strip()):
        errors.append("name must be a non-empty string")

    for section in ("model", "snippets"):
        if section in data and not isinstance(data[section], dict):
            errors.append(f"{section} must be an object")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "excluded_calls": excluded_calls,
    }


def read_parameters(project_id: str) -> dict[str, Any]:
    project = _require_project(project_id)
    path = parameter_json_path(project)
    if not path.is_file():
        return {
            "project_id": project_id,
            "path": str(path),
            "filename": path.name,
            "exists": False,
            "text": "",
            "updated_at": None,
            "validation": {
                "valid": False,
                "errors": ["File not found"],
                "warnings": [],
                "excluded_calls": [],
            },
        }
    text = path.read_text(encoding="utf-8")
    return {
        "project_id": project_id,
        "path": str(path),
        "filename": path.name,
        "exists": True,
        "text": text,
        "updated_at": path.stat().st_mtime,
        "validation": validate_parameters_text(text),
    }


def write_parameters(project_id: str, text: str) -> dict[str, Any]:
    """Save parameter JSON after validation; pretty-prints with orcAI's 4-space indent."""
    project = _require_project(project_id)
    validation = validate_parameters_text(text)
    if not validation["valid"]:
        raise ValueError("; ".join(validation["errors"]))
    path = parameter_json_path(project)
    data = json.loads(text)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    result = read_parameters(project_id)
    result["saved_at"] = time.time()
    return result
