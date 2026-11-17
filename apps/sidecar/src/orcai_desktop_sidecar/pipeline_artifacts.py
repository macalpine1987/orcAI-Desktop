"""Pipeline artifact / mtime / param scalar helpers."""

from __future__ import annotations

import csv
import gzip
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_studio import dir_stats


def mtime(path: Path | None) -> float | None:
    if path is None:
        return None
    try:
        return path.stat().st_mtime if path.exists() else None
    except OSError:
        return None


_mtime = mtime


def max_mtime(*values: float | None) -> float | None:
    present = [v for v in values if v is not None]
    return max(present) if present else None


_max_mtime = max_mtime


def newer(left: float | None, right: float | None) -> bool:
    return left is not None and right is not None and left > right + 0.5


_newer = newer


def int_param(section: dict[str, Any] | None, *keys: str, default: int = 0) -> int:
    if not isinstance(section, dict):
        return default
    for key in keys:
        raw = section.get(key)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            return int(raw)
        if isinstance(raw, str):
            try:
                return int(float(raw.strip().replace(",", ".")))
            except ValueError:
                continue
    return default


_int_param = int_param


def float_param(section: dict[str, Any] | None, *keys: str, default: float = 0.0) -> float:
    if not isinstance(section, dict):
        return default
    for key in keys:
        raw = section.get(key)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            return float(raw)
        if isinstance(raw, str):
            try:
                return float(raw.strip().replace(",", "."))
            except ValueError:
                continue
    return default


_float_param = float_param


def _gzip_data_rows(path: Path) -> int | None:
    if not path.is_file():
        return None
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            if handle.readline() == "":
                return 0
            return sum(1 for _ in handle)
    except OSError:
        return None


def _snippet_rows_by_type(path: Path) -> dict[str, int]:
    """Raw row counts per data_type from all_snippets.csv.gz (stdlib only)."""
    if not path.is_file():
        return {}
    counts: dict[str, int] = {}
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                key = str(row.get("data_type") or "").strip() or "unknown"
                counts[key] = counts.get(key, 0) + 1
    except OSError:
        return {}
    return counts

def _table_row_count(table_path: Path | None) -> int:
    if table_path is None or not table_path.is_file():
        return 0
    try:
        with table_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            if next(reader, None) is None:
                return 0
            return sum(1 for _ in reader)
    except (OSError, csv.Error):
        return 0


def _child_dir_count(root: Path, child: str) -> tuple[int, int, float | None, Path | None]:
    """Count recording folders that contain ``child`` (spectrogram / labels).

    Only the named child counts. A spectrogram tree must not make ``labels`` look done.
    """
    if not root.is_dir():
        return 0, 0, None, None
    count = 0
    size = 0
    newest: float | None = None
    for entry in root.iterdir():
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        target = entry / child
        if not target.exists():
            continue
        count += 1
        _files, bytes_, mtime = (
            dir_stats(target)
            if target.is_dir()
            else (1, target.stat().st_size, target.stat().st_mtime)
        )
        size += bytes_
        newest = mtime if newest is None else (
            mtime if mtime is not None and mtime > newest else newest
        )
    if count:
        return count, size, newest, root
    return 0, 0, None, root


def _file_bundle(paths: list[Path]) -> tuple[int, int, float | None]:
    files = 0
    size = 0
    newest: float | None = None
    for path in paths:
        if not path.exists():
            continue
        if path.is_file():
            files += 1
            stat = path.stat()
            size += stat.st_size
            newest = stat.st_mtime if newest is None else max(newest, stat.st_mtime)
            continue
        if path.is_dir():
            d_files, d_size, d_mtime = dir_stats(path)
            files += d_files
            size += d_size
            newest = _max_mtime(newest, d_mtime)
    return files, size, newest


