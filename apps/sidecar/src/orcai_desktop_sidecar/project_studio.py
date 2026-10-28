"""Projects section: recording table, annotations, artifacts, parameters.

Everything here reads orcAI artifacts from the project directory; nothing is
re-implemented from the engine. Column names of ``recording_table.csv`` are the
orcAI originals and are never renamed.
"""

from __future__ import annotations

import contextlib
import csv
import json
import os
import re
import shutil
import tempfile
import threading
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
from orcai_desktop_sidecar.store import list_all_jobs

TABLE_STANDARD_COLUMNS: tuple[str, ...] = (
    "recording",
    "channel",
    "duplicate",
    "base_dir_recording",
    "rel_recording_path",
    "base_dir_annotation",
    "rel_annotation_path",
)

ARTIFACT_DIRS: tuple[str, ...] = (
    "spectrograms",
    "label_arrays",
    "tvt_data",
    "models",
    "predictions",
)

DEFAULT_SAMPLING_RATE_HZ = 48_000

# Minimal shape of <name>_orcai_parameter.json when orcai.defaults is unavailable.
_FALLBACK_PARAMETER_DEFAULTS: dict[str, Any] = {
    "name": "orcai-v1",
    "architecture": "ResNetLSTM",
    "model": {},
    "spectrogram": {
        "sampling_rate": DEFAULT_SAMPLING_RATE_HZ,
        "nfft": 512,
        "n_overlap": 256,
        "freq_range": [0, 16000],
        "quantiles": [0.01, 0.999],
        "duration": 4,
    },
    "calls": ["BR", "BUZZ", "HERDING", "PHS", "SS", "TAILSLAP", "WHISTLE"],
    "snippets": {},
    "seed": 0,
}


# --------------------------------------------------------------------------- helpers


def _require_project(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    return project


def parameter_json_path(project: dict[str, Any]) -> Path:
    return Path(project["path"]) / f"{project['orcai_name']}_orcai_parameter.json"


def _read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def orcai_parameter_defaults() -> dict[str, Any]:
    """Default parameter document shipped with orcAI (fallback when not installed)."""
    # orcai may be absent in unit tests → fall back to the embedded shape.
    with contextlib.suppress(Exception):
        from importlib.resources import files

        resource = files("orcai.defaults").joinpath("default_orcai_parameter.json")
        data = json.loads(resource.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    return json.loads(json.dumps(_FALLBACK_PARAMETER_DEFAULTS))


def _parameter_calls(parameter: dict[str, Any] | None) -> list[str]:
    if not parameter:
        return []
    calls = parameter.get("calls")
    if not isinstance(calls, list):
        return []
    return [str(c) for c in calls]


def _parameter_sampling_rate(parameter: dict[str, Any] | None) -> int:
    if not parameter:
        return DEFAULT_SAMPLING_RATE_HZ
    spec = parameter.get("spectrogram")
    if isinstance(spec, dict):
        try:
            value = int(spec.get("sampling_rate") or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return DEFAULT_SAMPLING_RATE_HZ


def _is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def _truthy_cell(value: str | None) -> bool | None:
    """Recording-table class cell: empty → masked (None); otherwise truthiness."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "<na>", "none"}:
        return None
    return text.lower() not in {"0", "false", "no"}


# --------------------------------------------------------------------------- CSV I/O


def _read_table_rows(table_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    columns, rows, _header = _read_table_rows_raw(table_path)
    return columns, rows


def _read_table_rows_raw(
    table_path: Path,
) -> tuple[list[str], list[dict[str, str]], str]:
    """Columns/rows with the index column normalised to ``recording``.

    Returns the original first header too (pandas may write it as an empty string).
    """
    with table_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        columns = [c or "" for c in (reader.fieldnames or [])]
        rows = [
            {(k or ""): (v if v is not None else "") for k, v in row.items()}
            for row in reader
        ]
    first_header = columns[0] if columns else "recording"
    if columns and columns[0] == "":
        columns[0] = "recording"
        rows = [{("recording" if k == "" else k): v for k, v in row.items()} for row in rows]
    return columns, rows, first_header


# Serialises read-modify-write of ``recording_table.csv`` across request threads.
TABLE_WRITE_LOCK = threading.RLock()


def _write_table_rows(table_path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    with TABLE_WRITE_LOCK:
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{table_path.name}.", suffix=".tmp", dir=str(table_path.parent)
        )
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
                writer.writeheader()
                for row in rows:
                    writer.writerow({c: row.get(c, "") for c in columns})
            # mkstemp creates 0600; keep the table's previous permissions.
            try:
                mode = table_path.stat().st_mode & 0o777
            except OSError:
                mode = 0o644
            os.chmod(tmp, mode)
            os.replace(tmp, table_path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise


def _resolve_table_file(project_dir: Path, base: str, rel: str) -> Path | None:
    """Resolve a CSV base_dir_* + rel_* path; prefer files inside the project.

    Absolute ``base_dir_*`` from the machine that created the CSV (or the folder
    annotations were imported from) must not win over ``recordings/`` /
    ``annotations/`` copies already in the project.
    """
    if not rel.strip():
        return None
    rel_clean = rel.strip().lstrip("/\\")
    rel_name = Path(rel.strip()).name
    base_raw = base.strip()
    candidates: list[Path] = []

    # 1) Standard orcAI layout inside this project (Desktop always copies here).
    for dirname in ("recordings", "annotations"):
        candidates.append(project_dir / dirname / rel_name)
    candidates.append(project_dir / rel_clean)
    candidates.append(project_dir / rel_name)

    # 2) Relative base under the project.
    if base_raw and not Path(base_raw).is_absolute():
        candidates.append(project_dir / base_raw / rel.strip())
        candidates.append(project_dir / base_raw / rel_name)

    # 3) Portable remap: …/annotations/foo.txt → <project>/annotations/foo.txt
    if base_raw:
        base_path = Path(base_raw)
        if base_path.is_absolute():
            name = base_path.name
            if name:
                candidates.append(project_dir / name / rel_name)
                candidates.append(project_dir / name / rel_clean)
            # Last resort: original absolute path (source still on disk).
            candidates.append(base_path / rel.strip())
            candidates.append(base_path / rel_name)

    seen: set[str] = set()
    for cand in candidates:
        try:
            key = str(cand.resolve()) if cand.exists() else str(cand)
        except OSError:
            key = str(cand)
        if key in seen:
            continue
        seen.add(key)
        if cand.is_file():
            return cand
    # Miss: do not invent a phantom path (avoids CSV+disk duplicate rows, P2-12).
    return None


def _wav_meta_safe(path: Path) -> dict[str, Any]:
    from orcai_desktop_sidecar.wav_io import read_wav_meta

    try:
        meta = read_wav_meta(path)
    except Exception:  # noqa: BLE001 — soundfile may be missing or file corrupt
        return {"meta_error": True}
    return {
        "duration_sec": meta.get("duration_sec"),
        "sample_rate_hz": meta.get("sample_rate_hz"),
        "channels": meta.get("channels"),
        "bit_depth": meta.get("bit_depth"),
    }


# orcAI predict: ``{stem}_c{channel}_{model}_predicted.txt`` (adapters/predict.py).
_PREDICTED_CHANNEL_RE = re.compile(
    r"^(?P<stem>.+)_c(?P<channel>\d+)_(?P<model>.+)_predicted\.txt$",
)


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


def read_recording_table(project_id: str) -> dict[str, Any]:
    """Full recording_table.csv plus computed per-row facts (FR-2.5)."""
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    # Heal stale import-source base_dir_* before resolving rows.
    _rewrite_table_base_dirs(project_dir)
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


def _rewrite_table_base_dirs(project_dir: Path) -> None:
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


def _rewrite_annotation_base_dirs(project_dir: Path) -> None:
    """Backward-compatible alias — rewrites both recording and annotation bases."""
    _rewrite_table_base_dirs(project_dir)


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


def _count_labels_in_file(path: Path) -> dict[str, int]:
    """Count Audacity-style labels (start<TAB>stop<TAB>label) per class."""
    return _label_file_stats(path)[0]


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
    _rewrite_table_base_dirs(project_dir)
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


def _dir_stats(path: Path) -> tuple[int, int, float | None]:
    files = 0
    size = 0
    newest: float | None = None
    for entry in path.rglob("*"):
        if not entry.is_file() or _is_hidden(entry.relative_to(path)):
            continue
        stat = entry.stat()
        files += 1
        size += stat.st_size
        newest = stat.st_mtime if newest is None else max(newest, stat.st_mtime)
    return files, size, newest


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
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return {
            "valid": False,
            "errors": [f"JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})"],
            "warnings": [],
        }
    if not isinstance(data, dict):
        return {"valid": False, "errors": ["Top level must be a JSON object"], "warnings": []}

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
                    warnings.append(f"{missing} excluded from calls")

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
            if (
                isinstance(spec.get("nfft"), int)
                and isinstance(spec.get("n_overlap"), int)
                and spec["n_overlap"] >= spec["nfft"]
            ):
                errors.append("spectrogram.n_overlap must be smaller than nfft")

    name = data.get("name")
    if "name" in data and (not isinstance(name, str) or not name.strip()):
        errors.append("name must be a non-empty string")

    for section in ("model", "snippets"):
        if section in data and not isinstance(data[section], dict):
            errors.append(f"{section} must be an object")

    return {"valid": not errors, "errors": errors, "warnings": warnings}


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
            "validation": {"valid": False, "errors": ["File not found"], "warnings": []},
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
