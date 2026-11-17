"""Helpers for training monitor snapshot (m14)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.model_paths import resolve_trained_model_dir
from orcai_desktop_sidecar.project_registry import get_project
from orcai_desktop_sidecar.store import normalize_project_dir

_log = logging.getLogger(__name__)


def _require_project(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    return project


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _job_belongs(params: dict[str, Any], project_dir: Path) -> bool:
    want = normalize_project_dir(str(project_dir))
    root = str(project_dir.resolve())
    for key in ("project_dir", "output_dir", "data_dir", "model_dir"):
        value = params.get(key)
        if not isinstance(value, str) or not value:
            continue
        candidate = normalize_project_dir(value)
        if candidate == want:
            return True
        if value == root or value.startswith(root + "/") or value.startswith(root + "\\"):
            return True
    return False


def _latest_train_job(jobs: list[dict[str, Any]], project_dir: Path) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = None
    for job in jobs:
        if str(job.get("command") or "") != "train":
            continue
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if not _job_belongs(params, project_dir):
            continue
        if latest is None or float(job.get("updated_at") or 0) >= float(
            latest.get("updated_at") or 0
        ):
            latest = job
    return latest


def _model_dir_from_job(job: dict[str, Any] | None, parameter: dict[str, Any], project_dir: Path) -> Path | None:
    name = str(parameter.get("name") or "").strip()
    if job:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        out = params.get("output_dir")
        if isinstance(out, str) and out.strip():
            base = Path(out).expanduser()
            try:
                return resolve_trained_model_dir(base / name if name else base)
            except Exception:  # noqa: BLE001 — monitor probe is best-effort
                return Path(out)
    models = project_dir / "models"
    if name and (models / name).is_dir():
        return resolve_trained_model_dir(models / name)
    if models.is_dir():
        children = sorted(
            p for p in models.iterdir() if p.is_dir() and (p / "orcai_parameter.json").is_file()
        )
        if children:
            return resolve_trained_model_dir(children[-1])
    return None


def _checkpoint_info(model_dir: Path | None, model_name: str) -> dict[str, Any]:
    if model_dir is None:
        return {"path": None, "size_bytes": None, "mtime": None, "exists": False}
    keras_path = model_dir / f"{model_name}.keras"
    if not keras_path.is_file():
        # Any .keras in dir
        found = sorted(model_dir.glob("*.keras"))
        keras_path = found[0] if found else keras_path
    if not keras_path.is_file():
        return {
            "path": str(keras_path),
            "size_bytes": None,
            "mtime": None,
            "exists": False,
        }
    st = keras_path.stat()
    return {
        "path": str(keras_path),
        "size_bytes": int(st.st_size),
        "mtime": float(st.st_mtime),
        "exists": True,
    }


def _history_from_file(model_dir: Path | None) -> dict[str, list[float]]:
    if model_dir is None:
        return {}
    raw = _read_json(model_dir / "training_history.json")
    if not raw:
        return {}
    out: dict[str, list[float]] = {}
    for key, value in raw.items():
        if not isinstance(value, list):
            continue
        series: list[float] = []
        for item in value:
            try:
                series.append(float(item))
            except (TypeError, ValueError):
                continue
        if series:
            out[str(key)] = series
    return out


def _parse_history_dict(raw: Any) -> dict[str, list[float]]:
    if not isinstance(raw, dict) or not raw:
        return {}
    out: dict[str, list[float]] = {}
    for key, value in raw.items():
        if not isinstance(value, list) or not value:
            continue
        nums: list[float] = []
        for item in value:
            try:
                nums.append(float(item))
            except (TypeError, ValueError):
                continue
        if nums:
            out[str(key)] = nums
    return out


def _json_safe(value: Any) -> Any:
    """Replace NaN / Inf so Starlette can encode the snapshot."""
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _merge_history(
    live: dict[str, Any] | None,
    file_hist: dict[str, list[float]],
    *,
    active_job_id: str | None = None,
    job_status: str | None = None,
) -> dict[str, list[float]]:
    """Merge live + training_history.json.

    For an active train job (running/pending), only the live series for that
    ``job_id`` is used — never stitch a previous run's longer file history.
    When idle/done, prefer the longer series per key.
    """
    live_parsed = _parse_history_dict(live.get("history") if live else None)
    if job_status == "cancelled":
        return live_parsed
    active = bool(active_job_id) and job_status in ("running", "pending")
    if active:
        live_job = str(live.get("job_id") or "") if live else ""
        if live_job == str(active_job_id):
            return live_parsed
        return {}
    if not live_parsed:
        return file_hist
    if not file_hist:
        return live_parsed
    merged: dict[str, list[float]] = dict(file_hist)
    for key, series in live_parsed.items():
        prev = merged.get(key) or []
        if len(series) >= len(prev):
            merged[key] = series
    return merged


def _latest_job_for_commands(
    jobs: list[dict[str, Any]],
    project_dir: Path,
    commands: tuple[str, ...],
) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = None
    wanted = set(commands)
    for job in jobs:
        if str(job.get("command") or "") not in wanted:
            continue
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if not _job_belongs(params, project_dir):
            continue
        if latest is None or float(job.get("updated_at") or 0) >= float(
            latest.get("updated_at") or 0
        ):
            latest = job
    return latest


def _format_compression(raw: Any) -> str | None:
    """Normalize job/parameter compression to a monitor label, or None if unset."""
    if raw is None:
        return "None"
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        if text.lower() in ("none", "null"):
            return "None"
        return text
    return str(raw)


def _resolve_compression(
    *,
    parameter: dict[str, Any],
    model: dict[str, Any],
    train_job: dict[str, Any] | None,
    jobs: list[dict[str, Any]],
    project_dir: Path,
) -> str:
    """compression_type is a job CLI flag, not an orcAI parameter.json field.

    Prefer the latest train / create-tvt-data job; fall back to parameter if present;
    otherwise orcAI's usual default GZIP.
    """
    candidates: list[Any] = []
    if train_job:
        params = train_job.get("params") if isinstance(train_job.get("params"), dict) else {}
        if "compression_type" in params:
            candidates.append(params.get("compression_type"))
    tvt = _latest_job_for_commands(
        jobs,
        project_dir,
        ("create-tvt-data", "create-tvt-snippet-tables", "hpsearch", "test"),
    )
    if tvt:
        params = tvt.get("params") if isinstance(tvt.get("params"), dict) else {}
        if "compression_type" in params:
            candidates.append(params.get("compression_type"))
    if "compression_type" in parameter:
        candidates.append(parameter.get("compression_type"))
    if "compression_type" in model:
        candidates.append(model.get("compression_type"))
    for raw in candidates:
        label = _format_compression(raw)
        if label is not None:
            return label
    return "GZIP"


def _accel_label(accel: dict[str, Any]) -> str:
    active = str(accel.get("active_compute_device") or "").strip().lower()
    if active == "cpu":
        return "CPU"
    if not accel.get("gpu_available"):
        return "CPU"
    backend = str(accel.get("gpu_backend") or accel.get("accelerator_hint") or "GPU")
    low = backend.lower()
    if "metal" in low or "apple" in low:
        return "Apple GPU"
    if "cuda" in low:
        return "CUDA"
    if "directml" in low:
        return "DirectML"
    return backend


