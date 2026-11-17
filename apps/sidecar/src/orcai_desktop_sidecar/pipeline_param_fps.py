"""Pipeline parameter fingerprint tracking."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_artifacts import newer
from orcai_desktop_sidecar.pipeline_constants import (
    TRAIN_STEP_IDS,
    _PARAM_FPS_REL,
    _STALE_SNIPPET_STEPS,
    _STALE_SPEC_STEPS,
)
from orcai_desktop_sidecar.project_studio import read_json_file


def _stale_param_reason(step_id: str) -> str:
    if step_id in _STALE_SPEC_STEPS:
        return "params_changed_spectrogram"
    if step_id in _STALE_SNIPPET_STEPS:
        return "params_changed_snippets"
    return "params_changed"


def _param_slice_for_step(step_id: str, parameter: dict[str, Any]) -> dict[str, Any]:
    """Fields that actually affect a pipeline step's artifacts (FR-7.2)."""
    if step_id in _STALE_SPEC_STEPS:
        return {
            "spectrogram": parameter.get("spectrogram"),
            "calls": parameter.get("calls"),
        }
    if step_id in _STALE_SNIPPET_STEPS:
        return {
            "snippets": parameter.get("snippets"),
            "seed": parameter.get("seed"),
            "calls": parameter.get("calls"),
            "spectrogram": {
                "duration": (parameter.get("spectrogram") or {}).get("duration")
                if isinstance(parameter.get("spectrogram"), dict)
                else None,
            },
        }
    # hpsearch / train / test
    return {
        "name": parameter.get("name"),
        "architecture": parameter.get("architecture"),
        "model": parameter.get("model"),
        "seed": parameter.get("seed"),
        "calls": parameter.get("calls"),
    }


def _param_fingerprint(step_id: str, parameter: dict[str, Any]) -> str:
    payload = _param_slice_for_step(step_id, parameter)
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _param_fps_path(project_dir: Path) -> Path:
    return project_dir / _PARAM_FPS_REL


def _load_param_fps(project_dir: Path) -> dict[str, str]:
    path = _param_fps_path(project_dir)
    data = read_json_file(path)
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, str) and key in TRAIN_STEP_IDS:
            out[key] = value
    return out


def _save_param_fps(project_dir: Path, fps: dict[str, str]) -> None:
    path = _param_fps_path(project_dir)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(fps, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError:
        return


def record_step_param_fingerprint(
    project_dir: Path,
    step_id: str,
    *,
    parameter: dict[str, Any] | None = None,
    orcai_parameter: str | Path | None = None,
) -> None:
    """Pin the step's relevant params after a successful run (so later edits can go stale)."""
    if step_id not in TRAIN_STEP_IDS:
        return
    project_dir = project_dir.expanduser().resolve()
    doc = parameter
    if doc is None and orcai_parameter is not None:
        doc = read_json_file(Path(str(orcai_parameter)).expanduser())
    if not isinstance(doc, dict):
        return
    fps = _load_param_fps(project_dir)
    fps[step_id] = _param_fingerprint(step_id, doc)
    _save_param_fps(project_dir, fps)


def _params_make_step_stale(
    step_id: str,
    *,
    parameter: dict[str, Any],
    fps: dict[str, str],
    artifact_mtime: float | None,
    param_mtime: float | None,
) -> tuple[bool, str | None]:
    """Return (is_stale, fingerprint_to_pin_if_done).

    Stale only when the *relevant* parameter slice changed — not when the JSON
    file mtime bumps for an unrelated field (e.g. auto-clamped ``n_batch_*``).
    """
    current = _param_fingerprint(step_id, parameter)
    stored = fps.get(step_id)
    if stored is None:
        # First sight of a done artifact: accept current params as baseline.
        return False, current
    if stored == current:
        return False, current
    # Slice changed. If artifacts are newer than the parameter file, a re-run
    # already matched the new params but the fingerprint was not pinned yet.
    if artifact_mtime is not None and not newer(param_mtime, artifact_mtime):
        return False, current
    return True, None

# Public names (private _ aliases kept for compat).
load_param_fps = _load_param_fps
save_param_fps = _save_param_fps

