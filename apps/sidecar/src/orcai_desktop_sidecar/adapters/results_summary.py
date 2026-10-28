"""Project-wide prediction summary for Results.

Aggregates values already present in orcAI label files (`start`/`stop`/`mean_p`).
Does not recompute probabilities or invent metrics that are not in those files.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Literal

ResultsSource = Literal["predicted", "filtered", "annotations"]

_SKIP_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "Python.framework",
}

_PREDICTED_C_RE = re.compile(
    r"^(?P<stem>.+)_c(?P<channel>\d+)_(?P<model>.+)_predicted(?:_filtered)?\.txt$",
    re.IGNORECASE,
)
_PREDICTED_RE = re.compile(
    r"^(?P<stem>.+)_(?P<model>.+)_predicted(?:_filtered)?\.txt$",
    re.IGNORECASE,
)


def is_filtered_label_name(name: str) -> bool:
    lower = name.lower()
    return lower.endswith("_predicted_filtered.txt")


def is_predicted_label_name(name: str) -> bool:
    lower = name.lower()
    return lower.endswith("_predicted.txt") and not is_filtered_label_name(name)


def is_annotation_label_name(name: str) -> bool:
    lower = name.lower()
    if not lower.endswith(".txt"):
        return False
    return not (
        is_predicted_label_name(name)
        or is_filtered_label_name(name)
        or lower.endswith("_filtered.txt")
    )


def parse_label_filename(name: str) -> dict[str, Any]:
    """Infer recording stem / channel / model from orcAI output names."""
    match = _PREDICTED_C_RE.match(name)
    if match:
        return {
            "stem": match.group("stem"),
            "channel": int(match.group("channel")),
            "model": match.group("model"),
        }
    match = _PREDICTED_RE.match(name)
    if match:
        return {
            "stem": match.group("stem"),
            "channel": None,
            "model": match.group("model"),
        }
    stem = Path(name).stem
    for suffix in ("_predicted_filtered", "_predicted", "_filtered"):
        if stem.lower().endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    return {"stem": stem, "channel": None, "model": None}


def infer_wav_path(label_path: Path, stem: str, project_dir: Path | None = None) -> str | None:
    candidates = [label_path.with_name(f"{stem}.wav")]
    if project_dir is not None:
        candidates.append(project_dir / "recordings" / f"{stem}.wav")
        candidates.append(project_dir / f"{stem}.wav")
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate.resolve())
    return None


def _orcai_parameter_path(project_dir: Path) -> str | None:
    matches = sorted(project_dir.glob("*_orcai_parameter.json"))
    for path in matches:
        if path.is_file():
            return str(path.resolve())
    return None


def _iter_label_files(project_dir: Path, source: ResultsSource) -> list[Path]:
    if source == "annotations":
        from orcai_desktop_sidecar.project_registry import annotations_dir

        ann = annotations_dir(project_dir)
        if not ann.is_dir():
            return []
        found = [
            path
            for path in ann.iterdir()
            if path.is_file() and is_annotation_label_name(path.name)
        ]
        found.sort(key=lambda p: p.name.casefold())
        return found

    found: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(project_dir):
        dirnames[:] = [name for name in dirnames if name not in _SKIP_DIR_NAMES]
        for name in filenames:
            if source == "filtered":
                if not is_filtered_label_name(name):
                    continue
            elif not is_predicted_label_name(name):
                continue
            found.append(Path(dirpath) / name)
    found.sort(key=lambda p: str(p).casefold())
    return found


def _thresholds_from_jobs(project_dir: str) -> list[float]:
    """Unique predict `-th` values for this project only (not the global jobs list)."""
    try:
        from orcai_desktop_sidecar.jobs import list_jobs
        from orcai_desktop_sidecar.store import normalize_project_dir
    except Exception:  # noqa: BLE001 — jobs store is optional for summary
        return []
    want = normalize_project_dir(project_dir)
    if not want:
        return []
    values: list[float] = []
    seen: set[float] = set()
    try:
        jobs = list_jobs(project_dir)
    except Exception:  # noqa: BLE001 — summary enrichment is best-effort
        return []
    for job in jobs:
        if getattr(job, "command", None) != "predict":
            continue
        params = getattr(job, "params", None) or {}
        if normalize_project_dir(params.get("project_dir")) != want:
            continue
        raw = params.get("threshold")
        if not isinstance(raw, (int, float)):
            continue
        value = float(raw)
        if value in seen:
            continue
        seen.add(value)
        values.append(value)
    values.sort()
    return values


def _preview_label_file(
    path: Path,
    *,
    wav_path: str | None,
    channel: int,
    orcai_parameter_path: str | None,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.adapters.labels import labels_preview

    return labels_preview(
        path,
        wav_path=wav_path,
        channel=int(channel),
        orcai_parameter_path=orcai_parameter_path,
        compute_tf_bounds=False,
    )


def build_results_summary(
    project_dir: str | Path,
    *,
    source: ResultsSource = "predicted",
) -> dict[str, Any]:
    root = Path(project_dir).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Project directory not found: {root}")

    parameter_path = _orcai_parameter_path(root)
    files = _iter_label_files(root, source)
    rows: list[dict[str, Any]] = []
    class_counts: dict[str, dict[str, Any]] = {}
    models: list[str] = []
    model_seen: set[str] = set()
    recordings_with_hits: set[str] = set()
    files_ok = 0
    files_failed = 0

    for path in files:
        meta = parse_label_filename(path.name)
        stem = str(meta["stem"])
        wav_path = infer_wav_path(path, stem, root)
        channel = meta["channel"] if meta["channel"] is not None else 1
        model = meta["model"] if source != "annotations" else None
        kind = {
            "predicted": "predicted",
            "filtered": "filtered",
            "annotations": "annotation",
        }[source]
        if model and model not in model_seen:
            model_seen.add(model)
            models.append(model)

        try:
            preview = _preview_label_file(
                path,
                wav_path=wav_path,
                channel=int(channel),
                orcai_parameter_path=parameter_path,
            )
        except Exception:  # noqa: BLE001 — one bad label file must not fail the summary
            files_failed += 1
            continue
        files_ok += 1
        recording = f"{stem}.wav"
        resolved = str(path.resolve())
        for seg in preview["segments"]:
            start_sec = float(seg["start_sec"])
            stop_sec = float(seg["stop_sec"])
            duration_sec = max(0.0, stop_sec - start_sec)
            label = str(seg["label"])
            mean_p = seg.get("mean_p")
            mean_p_f = float(mean_p) if isinstance(mean_p, (int, float)) else None
            rows.append(
                {
                    "id": f"{resolved}:{start_sec:.6f}:{stop_sec:.6f}:{label}:{len(rows)}",
                    "recording": recording,
                    "wav_path": wav_path,
                    "label_path": resolved,
                    "label": label,
                    "start_sec": start_sec,
                    "stop_sec": stop_sec,
                    "duration_sec": duration_sec,
                    "mean_p": mean_p_f,
                    "model": model,
                    "channel": int(channel),
                    "kind": kind,
                }
            )
            bucket = class_counts.setdefault(
                label,
                {"label": label, "count": 0, "duration_sec": 0.0},
            )
            bucket["count"] += 1
            bucket["duration_sec"] += duration_sec
            recordings_with_hits.add(recording)

    mean_values = [row["mean_p"] for row in rows if row["mean_p"] is not None]
    mean_p = (sum(mean_values) / len(mean_values)) if mean_values else None
    duration_sec = sum(float(row["duration_sec"]) for row in rows)
    classes = sorted(
        class_counts.values(),
        key=lambda item: (-int(item["count"]), str(item["label"])),
    )
    recordings = sorted({row["recording"] for row in rows})
    thresholds = _thresholds_from_jobs(str(root))

    return {
        "source": source,
        "scan_dir": str(root),
        "files_total": len(files),
        "files_ok": files_ok,
        "files_failed": files_failed,
        "truncated": False,
        "summary": {
            "detection_count": len(rows),
            "recording_count": len(recordings_with_hits),
            "duration_sec": duration_sec,
            "mean_p": mean_p,
            "models": models,
            "thresholds": thresholds,
        },
        "classes": classes,
        "recordings": recordings,
        "rows": rows,
    }


def rows_to_csv(rows: list[dict[str, Any]]) -> str:
    header = [
        "recording",
        "class",
        "start_sec",
        "stop_sec",
        "duration_sec",
        "mean_p",
        "model",
        "label_path",
    ]
    lines = [",".join(header)]
    for row in rows:
        values = [
            _csv_cell(row.get("recording")),
            _csv_cell(row.get("label")),
            _csv_cell(row.get("start_sec")),
            _csv_cell(row.get("stop_sec")),
            _csv_cell(row.get("duration_sec")),
            _csv_cell(row.get("mean_p")),
            _csv_cell(row.get("model")),
            _csv_cell(row.get("label_path")),
        ]
        lines.append(",".join(values))
    return "\n".join(lines) + ("\n" if rows else "")


def rows_to_audacity_text(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    ordered = sorted(
        rows,
        key=lambda row: (float(row.get("start_sec") or 0), float(row.get("stop_sec") or 0)),
    )
    for row in ordered:
        t0 = float(row.get("start_sec") or 0)
        t1 = float(row.get("stop_sec") or t0)
        label = str(row.get("label") or "").replace("\t", " ")
        lines.append(f"{t0:.9f}\t{t1:.9f}\t{label}")
    return "\n".join(lines) + ("\n" if lines else "")


def _csv_cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    if any(ch in text for ch in ',\"\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text
