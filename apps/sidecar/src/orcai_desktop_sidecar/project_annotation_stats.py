"""Annotation / prediction / readiness summary helpers (extracted from project_registry)."""

from __future__ import annotations

import contextlib
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_annotation_counts import (
    _count_annotation_label_files,
    _count_paired_annotation_label_files,
    _count_predictions_needing_filter,
    _count_predicted_labels,
    _count_trained_model_checkpoints,
    _count_tvt_dataset_files,
    _filtered_sibling_for_predicted,
    _is_manual_annotation_label,
    _newest_manual_annotation_mtime,
    _predicted_files_by_stem,
    _predicted_files_for_recordings,
    _prediction_needs_filter,
    _primary_trained_model_name,
    _recording_stem_from_predicted_name,
)
from orcai_desktop_sidecar.project_annotation_readiness import (
    ProjectFocus,
    ReadinessState,
    _compute_next_actions,
    _infer_project_focus,
    _parse_recording_table_stats,
    _readiness_annotations,
    _readiness_datasets,
    _readiness_model,
    _readiness_predict,
    _readiness_recordings,
    _recording_table_sync_status,
)
from orcai_desktop_sidecar.project_paths import (
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_recordings_io import list_wav_files

__all__ = [
    "ProjectFocus",
    "ReadinessState",
    "_compute_next_actions",
    "_count_annotation_label_files",
    "_count_paired_annotation_label_files",
    "_count_predictions_needing_filter",
    "_count_predicted_labels",
    "_count_trained_model_checkpoints",
    "_count_tvt_dataset_files",
    "_filtered_sibling_for_predicted",
    "_infer_project_focus",
    "_is_manual_annotation_label",
    "_newest_manual_annotation_mtime",
    "_parse_recording_table_stats",
    "_predicted_files_by_stem",
    "_predicted_files_for_recordings",
    "_prediction_needs_filter",
    "_primary_trained_model_name",
    "_readiness_annotations",
    "_readiness_datasets",
    "_readiness_model",
    "_readiness_predict",
    "_readiness_recordings",
    "_recording_stem_from_predicted_name",
    "_recording_table_sync_status",
    "compute_project_summary",
]

def compute_project_summary(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_crud import get_project

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
    unfiltered_count = _count_predictions_needing_filter(project_dir)
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
                # Predicted files missing an up-to-date *_predicted_filtered.txt
                # (also after re-predict when the filtered sibling is older).
                "unfiltered": unfiltered_count,
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
        "next_actions": _compute_next_actions(
            readiness,
            table_sync=table_sync,
            wav_count=wav_count,
            paired_annotations=disk_paired_ann,
            predicted_count=predicted_count,
            unfiltered_count=unfiltered_count,
        ),
    }
