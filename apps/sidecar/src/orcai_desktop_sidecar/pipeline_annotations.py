"""Pipeline annotation / recordings readiness helpers."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_artifacts import max_mtime, mtime, _table_row_count
from orcai_desktop_sidecar.pipeline_constants import (
    STATUS_BLOCKED,
    STATUS_DONE,
    STATUS_QUEUED,
    STATUS_RUNNING,
    STEPS_NEEDING_ANNOTATION_TXT,
)
from orcai_desktop_sidecar.pipeline_readiness import recordings_table_lamp
from orcai_desktop_sidecar.project_registry import (
    _recording_table_sync_status,
    annotations_dir,
    list_wav_files,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_studio import is_hidden


def recordings_readiness(
    project_dir: Path,
    *,
    table_path: Path | None,
    table_rows: int,
) -> dict[str, Any]:
    wav_count = len(list_wav_files(recordings_dir(project_dir)))
    sync = _recording_table_sync_status(
        project_dir,
        wav_count=wav_count,
        table_path=table_path,
        table_rows=table_rows,
    )
    return {
        "state": recordings_table_lamp(sync, table_rows=table_rows, wav_count=wav_count),
        "rows": table_rows,
        "path": str(table_path) if table_path else None,
        "sync": sync,
    }


def annotation_stats(project_dir: Path, table_path: Path | None, table_rows: int) -> dict[str, Any]:
    ann = annotations_dir(project_dir)
    wav_stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    txts: list[Path] = []
    if ann.is_dir():
        txts = [
            path
            for path in ann.rglob("*.txt")
            if path.is_file() and not is_hidden(path.relative_to(ann))
        ]
    # A filled base_dir_annotation is the project folder, not a label file.
    # paired_txt is a manual .txt whose stem matches a loaded WAV (nested files
    # count; *_predicted / *_filtered do not). A CSV rel_annotation_path without
    # that file does not cover a WAV for the skip lamp or the «0 из N» lamp.
    annotated: set[str] = set()
    paired_txt: set[str] = set()
    for path in txts:
        name = path.name.lower()
        if name.endswith("_predicted.txt") or name.endswith("_filtered.txt"):
            continue
        stem = path.stem
        if stem in wav_stems:
            paired_txt.add(stem)
            annotated.add(stem)
            continue
        if not wav_stems:
            annotated.add(stem)
    if table_path is not None and table_path.is_file():
        try:
            with table_path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                fields = reader.fieldnames or []
                rec_key = fields[0] if fields else "recording"
                for row in reader:
                    rec = (row.get(rec_key) or row.get("recording") or "").strip()
                    rel = (row.get("rel_annotation_path") or "").strip()
                    if not rec or not rel:
                        continue
                    stem = Path(rec).stem
                    if wav_stems and stem not in wav_stems:
                        continue
                    annotated.add(stem)
        except (OSError, csv.Error):
            pass
    wav_count = len(wav_stems)
    total = wav_count if wav_stems else table_rows
    annotated_count = len(annotated)
    # WAV files that will be skipped: no annotation .txt with the same stem.
    unlabeled = wav_count - len(paired_txt)
    newest = None
    for path in txts:
        newest = max_mtime(newest, mtime(path))
    return {
        "annotated_count": annotated_count,
        "paired_txt_count": len(paired_txt),
        "wav_count": wav_count,
        "unlabeled_count": unlabeled,
        "total_count": total,
        "annotation_files": len(txts),
        "updated_at": newest,
    }


def annotations_readiness(ann: dict[str, Any]) -> dict[str, Any]:
    """Lamp numbers follow paired .txt files whenever WAV files are loaded.

    A CSV ``rel_annotation_path`` without that file must not turn the lamp green
    or change «0 из N». With no WAV files, keep the file/table count (a label
    added before its recording).
    """
    if ann["wav_count"] > 0:
        shown = ann["paired_txt_count"]
        total = ann["wav_count"]
    else:
        shown = ann["annotated_count"]
        total = ann["total_count"]
    if shown > 0:
        state = "ok"
    elif total > 0:
        state = "warn"
    else:
        state = "off"
    return {
        "state": state,
        "annotated": shown,
        "total": total,
        "paired": ann["paired_txt_count"],
        "wav_count": ann["wav_count"],
    }


def lacks_paired_annotation_txt(project_dir: Path) -> bool:
    """True when the project has WAV files and none has a matching annotation .txt."""
    project_dir = Path(project_dir).resolve()
    table_path = resolve_recording_table_path(project_dir)
    table_rows = _table_row_count(table_path)
    ann = annotation_stats(project_dir, table_path, table_rows)
    return ann["wav_count"] > 0 and ann["paired_txt_count"] <= 0


def block_steps_without_annotations(
    steps: list[dict[str, Any]],
    ann: dict[str, Any],
) -> None:
    """Keep spectrograms runnable; hold every later step until a paired .txt exists."""
    if not (ann["wav_count"] > 0 and ann["paired_txt_count"] <= 0):
        return
    for step in steps:
        if step["id"] not in STEPS_NEEDING_ANNOTATION_TXT:
            continue
        if step["status"] in (STATUS_RUNNING, STATUS_QUEUED):
            continue
        step["can_run"] = False
        if step["status"] != STATUS_DONE:
            step["status"] = STATUS_BLOCKED
            step["reason"] = "no_annotations"

# Compat aliases
_recordings_readiness = recordings_readiness
_annotation_stats = annotation_stats
_annotations_readiness = annotations_readiness
_block_steps_without_annotations = block_steps_without_annotations
