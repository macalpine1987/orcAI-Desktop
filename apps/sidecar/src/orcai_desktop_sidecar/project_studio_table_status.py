"""Recording-table predict / annotation status helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import annotations_dir
from orcai_desktop_sidecar.project_studio_helpers import _is_hidden
from orcai_desktop_sidecar.project_studio_table_io import (
    _PREDICTED_CHANNEL_RE,
    _resolve_table_file,
)
from orcai_desktop_sidecar.store import list_all_jobs

def _recording_stem_from_predicted_name(name: str) -> str | None:
    if not name.endswith("_predicted.txt"):
        return None
    match = _PREDICTED_CHANNEL_RE.match(name)
    if match:
        return match.group("stem")
    # Legacy short form used in tests / older exports: ``a_predicted.txt``.
    return name[: -len("_predicted.txt")]


def _predicted_files_by_stem(project_dir: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for path in project_dir.rglob("*_predicted.txt"):
        if _is_hidden(path.relative_to(project_dir)) or not path.is_file():
            continue
        stem = _recording_stem_from_predicted_name(path.name)
        if not stem:
            continue
        prev = found.get(stem)
        if prev is None or path.stat().st_mtime > prev.stat().st_mtime:
            found[stem] = path
    return found


def _predict_job_states(project_dir: Path) -> dict[str, str]:
    """Latest predict job status per WAV path (running | failed | completed)."""
    states: dict[str, str] = {}
    try:
        jobs = list_all_jobs(project_dir=str(project_dir), limit=300)
    except Exception:  # noqa: BLE001 — job store is best effort here
        return states
    for job in jobs:  # newest first
        if job.get("command") != "predict":
            continue
        params = job.get("params") or {}
        wav = params.get("wav_path")
        if not wav:
            continue
        key = str(Path(str(wav)).resolve())
        if key in states:
            continue
        status = str(job.get("status") or "")
        if status in {"running", "pending"}:
            states[key] = "running"
        elif status == "failed":
            states[key] = "failed"
        elif status == "completed":
            states[key] = "completed"
    return states


def _predict_status(
    wav_path: Path | None,
    stem: str,
    *,
    predicted: dict[str, Path],
    job_states: dict[str, str],
) -> str:
    key = str(wav_path.resolve()) if wav_path is not None else ""
    job_state = job_states.get(key)
    if job_state == "running":
        return "running"
    if stem in predicted:
        return "done"
    if job_state == "failed":
        return "failed"
    return "none"


def _is_manual_annotation_name(name: str) -> bool:
    lower = name.lower()
    if not lower.endswith(".txt"):
        return False
    return not (lower.endswith("_predicted.txt") or lower.endswith("_filtered.txt"))



def _resolve_annotation_path(
    project_dir: Path,
    raw: dict[str, str],
    *,
    stem: str | None = None,
) -> Path | None:
    """Resolve annotation from CSV paths, then ``annotations/{stem}.txt`` (BUG-03)."""
    ann_path = _resolve_table_file(
        project_dir,
        raw.get("base_dir_annotation", ""),
        raw.get("rel_annotation_path", ""),
    )
    if ann_path is not None and ann_path.is_file():
        return ann_path
    recording = (stem if stem is not None else raw.get("recording", "") or "").strip()
    if not recording:
        return None
    candidate = annotations_dir(project_dir) / f"{recording}.txt"
    if candidate.is_file() and _is_manual_annotation_name(candidate.name):
        return candidate
    return None



