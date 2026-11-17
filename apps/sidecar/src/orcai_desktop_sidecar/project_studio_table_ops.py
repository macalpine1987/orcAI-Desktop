"""Recording table rewrite / read / channel update."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import (
    annotations_dir,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_recordings_io import list_wav_files
from orcai_desktop_sidecar.project_studio_helpers import (
    _parameter_calls,
    _parameter_sampling_rate,
    _read_json_file,
    _truthy_cell,
)
from orcai_desktop_sidecar.project_studio_table_io import (
    TABLE_STANDARD_COLUMNS,
    TABLE_WRITE_LOCK,
    _read_table_rows,
    _read_table_rows_raw,
    _require_project,
    _resolve_table_file,
    _wav_meta_safe,
    _write_table_rows,
    parameter_json_path,
)
from orcai_desktop_sidecar.project_studio_table_status import (
    _predict_job_states,
    _predict_status,
    _predicted_files_by_stem,
    _resolve_annotation_path,
)

def rewrite_table_base_dirs(project_dir: Path) -> None:
    """Point ``base_dir_recording`` / ``base_dir_annotation`` at project folders.

    After annotation import (or a table built on another Mac), CSV rows often keep
    the *source* folder. Desktop always copies into ``recordings/`` and
    ``annotations/`` — rewrite so wizard / orcAI jobs do not follow the old path.
    """
    table = resolve_recording_table_path(project_dir)
    if table is None or not table.is_file():
        return
    rec_dir = recordings_dir(project_dir)
    ann_dir = annotations_dir(project_dir)

    def heal(row: dict[str, str], base_key: str, rel_key: str, folder: Path) -> bool:
        # Only rows whose file has a copy in the project folder: a CLI project
        # that keeps WAVs elsewhere, or a row without a path, stays untouched.
        rel = (row.get(rel_key) or "").strip()
        if not rel or (row.get(base_key) or "").strip() == str(folder):
            return False
        if not (folder / rel).is_file():
            return False
        row[base_key] = str(folder)
        return True

    with TABLE_WRITE_LOCK:
        try:
            columns, rows = _read_table_rows(table)
        except (OSError, UnicodeDecodeError, csv.Error):
            return
        if not rows:
            return
        changed = False
        if "base_dir_recording" in columns:
            for row in rows:
                changed |= heal(row, "base_dir_recording", "rel_recording_path", rec_dir)
        if "base_dir_annotation" in columns:
            for row in rows:
                changed |= heal(row, "base_dir_annotation", "rel_annotation_path", ann_dir)
        if changed:
            try:
                _write_table_rows(table, columns, rows)
            except OSError:
                return


_rewrite_table_base_dirs = rewrite_table_base_dirs


def _rewrite_annotation_base_dirs(project_dir: Path) -> None:
    """Backward-compatible alias — rewrites both recording and annotation bases."""
    rewrite_table_base_dirs(project_dir)




def read_recording_table(project_id: str) -> dict[str, Any]:
    """Full recording_table.csv plus computed per-row facts (FR-2.5)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    # Heal stale import-source base_dir_* before resolving rows.
    rewrite_table_base_dirs(project_dir)
    parameter = _read_json_file(parameter_json_path(project))
    target_sr = _parameter_sampling_rate(parameter)
    calls = _parameter_calls(parameter)
    table_path = resolve_recording_table_path(project_dir)

    columns: list[str] = []
    raw_rows: list[dict[str, str]] = []
    if table_path is not None:
        try:
            columns, raw_rows = _read_table_rows(table_path)
        except (OSError, csv.Error, UnicodeDecodeError):
            columns, raw_rows = [], []

    class_columns = [c for c in columns if c and c not in TABLE_STANDARD_COLUMNS]
    predicted = _predicted_files_by_stem(project_dir)
    job_states = _predict_job_states(project_dir)

    rows: list[dict[str, Any]] = []
    seen_wavs: set[str] = set()
    for raw in raw_rows:
        stem = raw.get("recording", "")
        wav_path = _resolve_table_file(
            project_dir,
            raw.get("base_dir_recording", ""),
            raw.get("rel_recording_path", ""),
        )
        ann_path = _resolve_annotation_path(project_dir, raw, stem=stem)
        # Prefer local recordings/<stem>.wav when CSV paths miss (USB / renamed, P2-12).
        if (wav_path is None or not wav_path.is_file()) and stem.strip():
            fallback = recordings_dir(project_dir) / f"{stem.strip()}.wav"
            if fallback.is_file():
                wav_path = fallback
        wav_exists = bool(wav_path and wav_path.is_file())
        if wav_exists and wav_path is not None:
            seen_wavs.add(str(wav_path.resolve()))
        meta = _wav_meta_safe(wav_path) if wav_exists else {}
        sr = meta.get("sample_rate_hz")
        rows.append(
            {
                "recording": stem,
                "in_table": True,
                "cells": raw,
                "wav_path": str(wav_path) if wav_path else None,
                "wav_exists": wav_exists,
                "size_bytes": wav_path.stat().st_size if wav_exists else None,
                "duration_sec": meta.get("duration_sec"),
                "sample_rate_hz": sr,
                "channels": meta.get("channels"),
                "resample_to_hz": target_sr if sr and int(sr) != target_sr else None,
                "annotation_path": str(ann_path) if ann_path else None,
                "annotation_exists": bool(ann_path and ann_path.is_file()),
                "predict_status": _predict_status(
                    wav_path, stem, predicted=predicted, job_states=job_states
                ),
                "predicted_path": str(predicted[stem]) if stem in predicted else None,
                "channel": _parse_channel(raw.get("channel")),
                "duplicate": _truthy_cell(raw.get("duplicate")) or False,
            }
        )

    # WAV files on disk that the table does not know about yet (stale table).
    rec_dir = recordings_dir(project_dir)
    for wav in list_wav_files(rec_dir):
        if str(wav.resolve()) in seen_wavs:
            continue
        meta = _wav_meta_safe(wav)
        sr = meta.get("sample_rate_hz")
        rows.append(
            {
                "recording": wav.stem,
                "in_table": False,
                "cells": {},
                "wav_path": str(wav),
                "wav_exists": True,
                "size_bytes": wav.stat().st_size,
                "duration_sec": meta.get("duration_sec"),
                "sample_rate_hz": sr,
                "channels": meta.get("channels"),
                "resample_to_hz": target_sr if sr and int(sr) != target_sr else None,
                "annotation_path": None,
                "annotation_exists": False,
                "predict_status": _predict_status(
                    wav, wav.stem, predicted=predicted, job_states=job_states
                ),
                "predicted_path": str(predicted[wav.stem]) if wav.stem in predicted else None,
                "channel": None,
                "duplicate": False,
            }
        )

    # Always present recordings alphabetically (CSV/import order is not stable).
    rows.sort(
        key=lambda r: (
            str(r.get("recording") or "").casefold(),
            str(r.get("recording") or ""),
        )
    )

    return {
        "project_id": project_id,
        "table_path": str(table_path) if table_path else None,
        "table_exists": table_path is not None,
        "updated_at": table_path.stat().st_mtime if table_path else None,
        "columns": columns,
        "standard_columns": list(TABLE_STANDARD_COLUMNS),
        "class_columns": class_columns,
        "calls": calls,
        "target_sampling_rate_hz": target_sr,
        "default_channel": 1,
        "row_count": len(raw_rows),
        "rows": rows,
    }


def _parse_channel(value: str | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def set_recording_channel(project_id: str, recording: str, channel: int) -> dict[str, Any]:
    """Edit ``channel`` for one row in place; all other cells stay byte-identical."""
    if channel < 1:
        raise ValueError("channel must be >= 1")
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    table_path = resolve_recording_table_path(project_dir)
    if table_path is None:
        raise FileNotFoundError("recording_table.csv not found")
    with TABLE_WRITE_LOCK:
        columns, rows, first_header = _read_table_rows_raw(table_path)
        if "channel" not in columns:
            raise ValueError("recording_table.csv has no channel column")
        matched = False
        for row in rows:
            if row.get("recording") == recording:
                row["channel"] = str(channel)
                matched = True
        if not matched:
            raise FileNotFoundError(f"Recording not found in table: {recording}")
        # Keep the original index header (pandas may have written it empty).
        out_columns = [first_header if c == "recording" else c for c in columns]
        out_rows = [
            {(first_header if k == "recording" else k): v for k, v in row.items()}
            for row in rows
        ]
        _write_table_rows(table_path, out_columns, out_rows)
    return {"recording": recording, "channel": channel, "table_path": str(table_path)}


# --------------------------------------------------------------------------- annotations


