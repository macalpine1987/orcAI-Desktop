"""Annotations import / matrix / health (extracted from project_studio)."""

from __future__ import annotations

import re
import os
import json
import csv
import shutil
import time
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_registry import (
    annotations_dir,
    get_project,
    list_wav_files,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_studio_helpers import (
    _FALLBACK_PARAMETER_DEFAULTS,
    _is_hidden,
    _parameter_calls,
    _read_json_file,
    _truthy_cell,
    orcai_parameter_defaults,
)
from orcai_desktop_sidecar.project_studio_table import (
    TABLE_STANDARD_COLUMNS,
    TABLE_WRITE_LOCK,
    _is_manual_annotation_name,
    _read_table_rows,
    _require_project,
    _resolve_annotation_path,
    _resolve_table_file,
    _rewrite_annotation_base_dirs,
    rewrite_table_base_dirs,
    _write_table_rows,
    parameter_json_path,
)
from orcai_desktop_sidecar.store import list_all_jobs

def _unique_annotation_dest(dest_dir: Path, filename: str) -> Path:
    base = Path(filename).name
    stem = Path(base).stem
    suffix = Path(base).suffix
    n = 1
    while True:
        candidate = dest_dir / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def _wav_stems(project_dir: Path) -> set[str]:
    return {path.stem for path in list_wav_files(recordings_dir(project_dir))}


def _list_annotation_txt_files(project_dir: Path) -> list[Path]:
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return []
    files = [
        path
        for path in ann.iterdir()
        if path.is_file() and _is_manual_annotation_name(path.name)
    ]
    return sorted(files, key=lambda p: p.name.casefold())


def unpaired_annotation_files(project_dir: Path) -> list[dict[str, Any]]:
    """``.txt`` in annotations/ with no matching WAV stem in recordings/."""
    stems = _wav_stems(project_dir)
    unpaired: list[dict[str, Any]] = []
    for path in _list_annotation_txt_files(project_dir):
        if path.stem in stems:
            continue
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        unpaired.append(
            {
                "name": path.name,
                "path": str(path),
                "stem": path.stem,
                "size_bytes": size,
            }
        )
    return unpaired


def compute_data_health(
    project_dir: Path,
    *,
    table_sync: str,
    wav_count: int,
) -> dict[str, Any]:
    """Compact file-presence counts for the shell health banner (no lists).

    Existence only — does not load WAV audio metadata.
    """
    missing_wav = 0
    ann_gap = 0
    table_path = resolve_recording_table_path(project_dir)
    if table_path is not None and table_path.is_file():
        try:
            _columns, raw_rows = _read_table_rows(table_path)
        except (OSError, csv.Error, UnicodeDecodeError):
            raw_rows = []
        for raw in raw_rows:
            stem = (raw.get("recording") or "").strip()
            wav_path = _resolve_table_file(
                project_dir,
                raw.get("base_dir_recording", ""),
                raw.get("rel_recording_path", ""),
            )
            if (wav_path is None or not wav_path.is_file()) and stem:
                fallback = recordings_dir(project_dir) / f"{stem}.wav"
                if fallback.is_file():
                    wav_path = fallback
            wav_exists = bool(wav_path and wav_path.is_file())
            if not wav_exists:
                missing_wav += 1
                continue
            ann_path = _resolve_annotation_path(project_dir, raw, stem=stem)
            if not (ann_path and ann_path.is_file()):
                ann_gap += 1

    unpaired_count = len(unpaired_annotation_files(project_dir))
    table_stale = wav_count > 0 and table_sync in ("stale", "missing")
    return {
        "table_stale": table_stale,
        "missing_wav": missing_wav,
        "unpaired_ann": unpaired_count,
        "ann_gap": ann_gap,
    }


def import_annotations(project_id: str, source_paths: list[str]) -> dict[str, Any]:
    """Copy Audacity-style ``.txt`` labels into ``annotations/`` (overwrite by basename)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    dest_dir = annotations_dir(project_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    ordered = sorted(source_paths, key=lambda p: Path(p).name.casefold())
    imported: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []
    stems = _wav_stems(project_dir)

    for raw in ordered:
        src_path = Path(raw).expanduser()
        try:
            src_path = src_path.resolve()
        except OSError:
            failed.append({"path": str(raw), "error": "invalid_path"})
            continue
        if not src_path.is_file():
            failed.append({"path": str(src_path), "error": "not_found"})
            continue
        if not _is_manual_annotation_name(src_path.name):
            failed.append({"path": str(src_path), "error": "unsupported_type"})
            continue
        dest = dest_dir / src_path.name
        if dest.exists() and dest.resolve() != src_path:
            dest = _unique_annotation_dest(dest_dir, src_path.name)
        try:
            # copy (not copy2): a fresh mtime marks the recording table stale.
            shutil.copy(src_path, dest)
        except OSError as exc:
            failed.append({"path": str(src_path), "error": str(exc)})
            continue
        imported.append(
            {
                "source": str(src_path),
                "dest": str(dest),
                "name": dest.name,
                "paired": "1" if dest.stem in stems else "0",
            }
        )

    unpaired = unpaired_annotation_files(project_dir)
    paired_count = sum(1 for row in imported if row.get("paired") == "1")
    unpaired_imported_count = sum(1 for row in imported if row.get("paired") == "0")
    # Point recording_table.csv at project annotations/ (not the import source).
    _rewrite_annotation_base_dirs(project_dir)
    # Labels absent from parameter calls stay "unlisted" and the train wizard
    # never offers them. Adopt those names; CSV columns follow the next table sync.
    added_calls = adopt_annotation_calls(project_id) if imported else []
    return {
        "project_id": project_id,
        "imported": imported,
        "failed": failed,
        "imported_count": len(imported),
        "paired_count": paired_count,
        "unpaired_imported_count": unpaired_imported_count,
        "unpaired_count": len(unpaired),
        "unpaired": unpaired,
        "annotations_dir": str(dest_dir),
        "added_calls": added_calls,
    }


def _paired_annotation_labels(project_dir: Path) -> list[str]:
    """Unique labels from manual ``.txt`` that share a WAV stem, sorted for stability."""
    stems = _wav_stems(project_dir)
    seen: dict[str, None] = {}
    for path in _list_annotation_txt_files(project_dir):
        if path.stem not in stems:
            continue
        counts, _durations = _label_file_stats(path)
        for label in counts:
            if label not in seen:
                seen[label] = None
    return sorted(seen, key=str.casefold)


def _starter_calls() -> list[str]:
    """Class names written by ``orcai init`` before the user edits ``calls``."""
    raw = orcai_parameter_defaults().get("calls")
    if isinstance(raw, list):
        names = [str(item).strip() for item in raw if isinstance(item, str) and str(item).strip()]
        if names:
            return names
    fallback = _FALLBACK_PARAMETER_DEFAULTS["calls"]
    return [str(item) for item in fallback]


def _calls_are_starter(raw_calls: list[str]) -> bool:
    current = [item.strip() for item in raw_calls if item.strip()]
    starter = _starter_calls()
    return len(current) == len(set(current)) and set(current) == set(starter)


def adopt_annotation_calls(project_id: str) -> list[str]:
    """Write paired-annotation labels into parameter ``calls``.

    The untouched starter list is replaced when none of those names occur in the
    annotations. Any other list keeps its names and order; missing labels are
    appended. Unpaired ``.txt`` (no matching WAV) are ignored. Returns the names
    that were written.
    """
    project = _require_project(project_id)
    path = parameter_json_path(project)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict):
        return []
    raw_calls = data.get("calls")
    if not isinstance(raw_calls, list) or not all(isinstance(item, str) for item in raw_calls):
        return []
    labels = _paired_annotation_labels(Path(project["path"]).resolve())
    known = {item.strip() for item in raw_calls if item.strip()}
    starter = set(_starter_calls())
    replace_starter = (
        _calls_are_starter(raw_calls)
        and bool(labels)
        and not any(label in starter for label in labels)
    )
    if replace_starter:
        written = labels
        data["calls"] = written
    else:
        written = [label for label in labels if label not in known]
        if not written:
            return []
        data["calls"] = [*raw_calls, *written]
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    return written


def append_annotation_calls(project_id: str) -> list[str]:
    """Backward-compatible name for :func:`adopt_annotation_calls`."""
    return adopt_annotation_calls(project_id)


def delete_annotations(project_id: str, filenames: list[str]) -> dict[str, Any]:
    """Delete label files from ``annotations/`` by basename (manual labels only)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    dest_dir = annotations_dir(project_dir)
    removed: list[str] = []
    missing: list[str] = []
    for raw in filenames:
        name = Path(raw).name
        if not _is_manual_annotation_name(name):
            missing.append(name)
            continue
        path = dest_dir / name
        if not path.is_file():
            missing.append(name)
            continue
        try:
            path.unlink()
            removed.append(name)
        except OSError:
            missing.append(name)
    return {
        "project_id": project_id,
        "removed": removed,
        "missing": missing,
        "unpaired": unpaired_annotation_files(project_dir),
    }


def _label_file_stats(path: Path) -> tuple[dict[str, int], dict[str, float]]:
    """Counts and total duration (seconds) per class from Audacity-style labels."""
    counts: dict[str, int] = {}
    durations: dict[str, float] = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return counts, durations
    for line in text.splitlines():
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        try:
            start = float(parts[0])
            stop = float(parts[1])
        except ValueError:
            continue  # header or Audacity frequency line
        label = parts[2].strip()
        if not label:
            continue
        counts[label] = counts.get(label, 0) + 1
        dur = max(0.0, stop - start)
        durations[label] = durations.get(label, 0.0) + dur
    return counts, durations


def annotations_matrix(project_id: str) -> dict[str, Any]:
    """Per-recording label counts by class; ``None`` = class masked (FR-2.7)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    # Heal stale import-source base_dir_* (wizard / Projects open this often).
    rewrite_table_base_dirs(project_dir)
    parameter = _read_json_file(parameter_json_path(project))
    calls = _parameter_calls(parameter)
    table_path = resolve_recording_table_path(project_dir)
    ann_dir = annotations_dir(project_dir)

    columns: list[str] = []
    raw_rows: list[dict[str, str]] = []
    if table_path is not None:
        try:
            columns, raw_rows = _read_table_rows(table_path)
        except (OSError, csv.Error, UnicodeDecodeError):
            columns, raw_rows = [], []
    class_columns = [c for c in columns if c and c not in TABLE_STANDARD_COLUMNS]

    # (stem, ann_path, raw_row | None) — CSV rows first, then disk-only pairs (BUG-P-01).
    entries: list[tuple[str, Path, dict[str, str] | None]] = []
    seen_stems: set[str] = set()
    for raw in raw_rows:
        stem = (raw.get("recording") or "").strip()
        ann_path = _resolve_annotation_path(project_dir, raw, stem=stem or None)
        if ann_path is None or not ann_path.is_file():
            continue
        if stem:
            seen_stems.add(stem)
        else:
            stem = ann_path.stem
            seen_stems.add(stem)
        entries.append((stem, ann_path, raw))

    wav_stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    for path in _list_annotation_txt_files(project_dir):
        stem = path.stem
        if stem in seen_stems:
            continue
        if stem not in wav_stems:
            continue
        seen_stems.add(stem)
        entries.append((stem, path, None))

    label_keys: set[str] = set()
    counted: list[tuple[str, Path, dict[str, str] | None, dict[str, int], dict[str, float]]] = []
    for stem, ann_path, raw in entries:
        counts, durations = _label_file_stats(ann_path)
        label_keys.update(counts)
        counted.append((stem, ann_path, raw, counts, durations))

    classes = calls or class_columns or sorted(label_keys)
    extra_labels = {k for k in label_keys if k not in classes}

    rows: list[dict[str, Any]] = []
    total_by_class: dict[str, int] = {c: 0 for c in classes}
    recs_by_class: dict[str, int] = {c: 0 for c in classes}
    dur_by_class: dict[str, float] = {c: 0.0 for c in classes}
    for stem, ann_path, raw, counts, durations in counted:
        cells: dict[str, int | None] = {}
        for cls in classes:
            if raw is not None and cls in class_columns:
                possible = _truthy_cell(raw.get(cls))
                cells[cls] = None if possible is None else counts.get(cls, 0)
            else:
                cells[cls] = counts.get(cls, 0)
            n = cells[cls]
            if isinstance(n, int) and n > 0:
                total_by_class[cls] = total_by_class.get(cls, 0) + n
                recs_by_class[cls] = recs_by_class.get(cls, 0) + 1
                dur_by_class[cls] = dur_by_class.get(cls, 0.0) + durations.get(cls, 0.0)
        rows.append(
            {
                "recording": stem,
                "annotation_path": str(ann_path),
                "total_labels": sum(counts.values()),
                "counts": cells,
            }
        )

    max_count = max(total_by_class.values()) if total_by_class else 0
    class_stats = [
        {
            "id": cls,
            "count": total_by_class.get(cls, 0),
            "recordings": recs_by_class.get(cls, 0),
            "duration_sec": round(dur_by_class.get(cls, 0.0), 3),
            "coverage": (
                round(total_by_class.get(cls, 0) / max_count, 4) if max_count else 0.0
            ),
        }
        for cls in classes
    ]

    unpaired = unpaired_annotation_files(project_dir)
    total_count = len(raw_rows) if raw_rows else max(len(wav_stems), len(rows))
    return {
        "project_id": project_id,
        "classes": classes,
        "classes_source": "parameters"
        if calls
        else ("table" if class_columns else "annotations"),
        "has_mask_columns": bool(class_columns),
        "rows": rows,
        "class_stats": class_stats,
        "unlisted_labels": sorted(extra_labels),
        "annotated_count": len(rows),
        "total_count": total_count,
        "unpaired": unpaired,
        "unpaired_count": len(unpaired),
        "annotations_dir": str(ann_dir),
    }


# --------------------------------------------------------------------------- artifacts


