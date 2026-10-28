"""Scan test / training metrics from project and model directories."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)


def _read_json_file(path: Path, limit_rows: int = 50) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(data, dict):
        preview = dict(list(data.items())[:limit_rows])
        return {"type": "json", "preview": preview}
    if isinstance(data, list):
        return {"type": "json_array", "preview": data[:limit_rows], "row_count": len(data)}
    return {"type": "json", "preview": str(data)[:2000]}


def _read_csv_preview(path: Path, limit_rows: int = 50) -> dict[str, Any] | None:
    try:
        import pandas as pd

        df = pd.read_csv(path)
        head = df.head(limit_rows)
        summary = _summarize_metrics_frame(head)
        return {
            "type": "csv",
            "columns": list(df.columns),
            "row_count": len(df),
            "preview": head.to_dict(orient="records"),
            "summary": summary or None,
        }
    except Exception:  # noqa: BLE001 — best-effort CSV preview for UI
        _log.debug("CSV metrics preview failed for %s", path, exc_info=True)
        return None


_METRIC_TABLE_HINTS = (
    "test_metrics",
    "metrics",
    "results",
    "evaluation",
    "per_class",
    "summary",
)


def _summarize_metrics_frame(df) -> dict[str, float | int | str | None]:
    import pandas as pd

    summary: dict[str, float | int | str | None] = {}
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series):
            val = series.iloc[0] if len(series) else None
            if val is not None and pd.notna(val):
                summary[str(col)] = float(val)
        elif len(series) and series.iloc[0] is not None:
            summary[str(col)] = str(series.iloc[0])
    return summary


def _pick_metric_tables(tables: list[str]) -> list[str]:
    hinted = [
        t
        for t in tables
        if any(hint in t.lower() for hint in _METRIC_TABLE_HINTS)
    ]
    return hinted or tables[:3]


def _read_duckdb_preview(path: Path, limit_rows: int = 50) -> dict[str, Any] | None:
    try:
        import duckdb
    except ImportError:
        return {
            "type": "duckdb",
            "error": "duckdb not installed (pip install 'orcai-desktop-sidecar[analytics]')",
        }

    try:
        con = duckdb.connect(str(path), read_only=True)
        tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
        previews: dict[str, Any] = {}
        summary: dict[str, float | int | str | None] = {}

        for table in _pick_metric_tables(tables):
            rows = con.execute(f'SELECT * FROM "{table}" LIMIT {limit_rows}').fetchdf()
            row_count = int(
                con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            )
            table_summary = _summarize_metrics_frame(rows)
            if table_summary and not summary:
                summary = table_summary
            previews[table] = {
                "columns": list(rows.columns),
                "row_count": row_count,
                "preview": rows.to_dict(orient="records"),
                "summary": table_summary or None,
            }

        con.close()
        return {
            "type": "duckdb",
            "tables": tables,
            "previews": previews,
            "summary": summary or None,
        }
    except Exception as exc:  # noqa: BLE001 — DuckDB preview; error string returned to UI
        return {"type": "duckdb", "error": str(exc)}


def scan_metrics_directory(
    directory: str | Path,
    *,
    limit_files: int = 20,
) -> list[dict[str, Any]]:
    root = Path(directory)
    if not root.is_dir():
        return []

    patterns = (
        "**/test_metrics*.csv",
        "**/metrics*.csv",
        "**/metrics*.json",
        "**/test_*.json",
        "**/test*.duckdb",
        "**/*metrics*.duckdb",
        "**/*.duckdb",
    )
    found: list[dict[str, Any]] = []
    seen: set[str] = set()

    for pattern in patterns:
        for path in sorted(root.rglob(pattern), key=lambda p: p.stat().st_mtime, reverse=True):
            key = str(path.resolve())
            if key in seen or not path.is_file():
                continue
            seen.add(key)
            entry: dict[str, Any] = {
                "path": key,
                "name": path.name,
                "size_bytes": path.stat().st_size,
            }
            suffix = path.suffix.lower()
            if suffix == ".json":
                entry["data"] = _read_json_file(path)
            elif suffix == ".csv":
                entry["data"] = _read_csv_preview(path)
            elif suffix == ".duckdb":
                entry["data"] = _read_duckdb_preview(path)
            found.append(entry)
            if len(found) >= limit_files:
                return found
    return found


def collect_test_metrics(
    *,
    model_dir: str | Path | None = None,
    project_dir: str | Path | None = None,
    data_dir: str | Path | None = None,
) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    scan_roots: list[Path] = []
    for raw in (model_dir, project_dir, data_dir):
        if raw:
            scan_roots.append(Path(raw))

    for root in scan_roots:
        files.extend(scan_metrics_directory(root))

    # De-duplicate by path
    by_path: dict[str, dict[str, Any]] = {}
    for f in files:
        by_path[f["path"]] = f

    return {
        "files": list(by_path.values()),
        "scan_roots": [str(p.resolve()) for p in scan_roots],
    }
