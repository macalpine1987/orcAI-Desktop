"""Annotation / prediction / readiness summary helpers (extracted from project_registry)."""

from __future__ import annotations

from pathlib import Path

from orcai_desktop_sidecar.project_annotation_counts import (
    _newest_manual_annotation_mtime,
)
from orcai_desktop_sidecar.project_focus_settings import (
    FOCUS_FULL,
    FOCUS_RECOGNITION,
    FOCUS_TRAINING,
)
from orcai_desktop_sidecar.project_paths import (
    PROJECT_KIND_TRAINING,
    annotations_dir,
    recordings_dir,
)
from orcai_desktop_sidecar.project_recordings_io import list_wav_files

ReadinessState = str  # "ready" | "needed" | "empty"
ProjectFocus = str  # "recognition" | "training" | "full"

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
    wav_count: int = 0,
    paired_annotations: int = 0,
    predicted_count: int = 0,
    unfiltered_count: int = 0,
) -> list[str]:
    """Home «Можно» list. Projects builds its own steps and does not read this."""
    actions: list[str] = []
    if table_sync in ("missing", "stale"):
        actions.append("sync_table")
    if readiness["recordings"] == "ready" and readiness["predict"] in ("needed", "ready"):
        # A first prediction used to replace «predict» with «filter». Files
        # that still have no prediction stay on the list.
        if readiness["predict"] == "needed" or wav_count - predicted_count > 0:
            actions.append("predict")
        if unfiltered_count > 0:
            actions.append("filter")
    # Partial labels stay visible. «needed» is only the case with none at all.
    if readiness["annotations"] == "needed" or wav_count - paired_annotations > 0:
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


