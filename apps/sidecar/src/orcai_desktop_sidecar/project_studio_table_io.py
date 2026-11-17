"""Recording table CSV read/write helpers."""

from __future__ import annotations

import csv
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_registry import get_project

TABLE_STANDARD_COLUMNS: tuple[str, ...] = (
    "recording",
    "channel",
    "duplicate",
    "base_dir_recording",
    "rel_recording_path",
    "base_dir_annotation",
    "rel_annotation_path",
)

def _require_project(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    return project


def parameter_json_path(project: dict[str, Any]) -> Path:
    return Path(project["path"]) / f"{project['orcai_name']}_orcai_parameter.json"


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
    except (OSError, ValueError, RuntimeError):
        # soundfile missing, unreadable path, or corrupt header.
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


