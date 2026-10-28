"""Training monitor snapshot for (m14)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.model_paths import resolve_trained_model_dir
from orcai_desktop_sidecar.project_registry import get_project
from orcai_desktop_sidecar.store import list_all_jobs, normalize_project_dir
from orcai_desktop_sidecar.train_live import read_live_state

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


def inspect_train_monitor(
    project_dir: Path,
    *,
    orcai_name: str,
    jobs: list[dict[str, Any]] | None = None,
    accelerator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project_dir = project_dir.resolve()
    param_path = project_dir / f"{orcai_name}_orcai_parameter.json"
    parameter = _read_json(param_path) or {}
    model = parameter.get("model") if isinstance(parameter.get("model"), dict) else {}
    model_name = str(parameter.get("name") or orcai_name or "model").strip() or "model"
    monitor = str(model.get("monitor") or "val_MBA")
    epochs = int(model.get("epochs") or 30)
    batch_size = int(model.get("batch_size") or 64)
    n_batch = int(model.get("n_batch_train") or 0)
    early_pat = int(model.get("EarlyStopping_patience") or model.get("early_stopping_patience") or 10)
    reduce_pat = int(
        model.get("ReduceLROnPlateau_patience") or model.get("reduce_lr_patience") or 5
    )
    train_job = _latest_train_job(jobs or [], project_dir)
    compression = _resolve_compression(
        parameter=parameter,
        model=model,
        train_job=train_job,
        jobs=jobs or [],
        project_dir=project_dir,
    )
    job_status = str(train_job.get("status") or "") if train_job else None
    running = job_status == "running"
    model_dir = _model_dir_from_job(train_job, parameter, project_dir)
    live = read_live_state(model_dir)
    active_job_id = str(train_job.get("id") or "") if train_job else None
    # Retrain in the same model_dir: ignore stale live from a previous job_id.
    if (
        job_status in ("running", "pending")
        and active_job_id
        and live
        and str(live.get("job_id") or "") != active_job_id
    ):
        live = None
    file_hist = _history_from_file(model_dir)
    history = _merge_history(
        live,
        file_hist,
        active_job_id=active_job_id,
        job_status=job_status,
    )

    live_epoch = int(live.get("epoch") or 0) if live else 0
    live_epochs = int(live.get("epochs") or epochs) if live else epochs
    if history.get(monitor) or history.get("val_MBA"):
        series = history.get(monitor) or history.get("val_MBA") or []
        hist_epoch = len(series)
    else:
        hist_epoch = 0

    if running and live_epoch:
        current_epoch = live_epoch
        total_epochs = live_epochs
    elif hist_epoch:
        current_epoch = hist_epoch
        total_epochs = max(epochs, hist_epoch)
    else:
        current_epoch = 0
        total_epochs = epochs

    metrics: dict[str, float | None] = {
        "val_MBA": None,
        "MBA": None,
        "loss": None,
        "val_loss": None,
        "learning_rate": None,
    }
    if live and isinstance(live.get("metrics"), dict):
        live_metrics = dict(live["metrics"])
        if live_metrics.get("learning_rate") is None and live_metrics.get("lr") is not None:
            live_metrics["learning_rate"] = live_metrics["lr"]
        for key in metrics:
            raw = live_metrics.get(key)
            if raw is not None:
                try:
                    metrics[key] = float(raw)
                except (TypeError, ValueError):
                    pass
    for key in list(metrics):
        if metrics[key] is None and key in history and history[key]:
            metrics[key] = float(history[key][-1])
    if metrics["learning_rate"] is None and "lr" in history and history["lr"]:
        metrics["learning_rate"] = float(history["lr"][-1])

    best_value = live.get("best_value") if live else None
    best_epoch = live.get("best_epoch") if live else None
    if best_value is None and monitor in history and history[monitor]:
        series = history[monitor]
        best_value = max(series)
        best_epoch = series.index(best_value) + 1
    epochs_since_best = int(live.get("epochs_since_best") or 0) if live else 0
    if not live and best_epoch and current_epoch:
        epochs_since_best = max(0, current_epoch - int(best_epoch))

    batch = int(live.get("batch") or 0) if live else 0
    batches = live.get("batches") if live else (n_batch or None)
    if batches is None and n_batch > 0:
        batches = n_batch
    batches_i = int(batches) if batches else None

    batch_pct: float | None = None
    if batches_i and batches_i > 0 and batch >= 0:
        batch_pct = max(0.0, min(1.0, batch / batches_i))

    elapsed = float(live.get("elapsed_sec") or 0) if live else None
    remaining = live.get("remaining_sec") if live else None
    started_at = float(live["started_at"]) if live and live.get("started_at") else None
    if running and train_job and elapsed is None:
        created = float(train_job.get("created_at") or 0)
        updated = float(train_job.get("updated_at") or 0)
        if created > 0:
            elapsed = max(0.0, updated - created) if updated >= created else None
            if started_at is None:
                started_at = created

    ckpt = _checkpoint_info(model_dir, model_name)
    accel = accelerator or {}
    accel_label = _accel_label(accel)

    # Early-stop counts the whole plateau. ReduceLR has its own wait: a drop
    # resets it and cooldown pauses it. Prefer the Keras callback snapshot.
    early_left = max(0, early_pat - epochs_since_best) if early_pat else None
    live_reduce = (
        live.get("reduce_lr")
        if live and isinstance(live.get("reduce_lr"), dict)
        else None
    )
    if live_reduce is not None:
        reduce_pat = int(live_reduce.get("patience") or reduce_pat)
        reduce_wait = int(live_reduce.get("wait") or 0)
        reduce_in = live_reduce.get("in_epochs")
        if reduce_in is not None:
            reduce_in = int(reduce_in)
    else:
        reduce_wait = epochs_since_best
        reduce_in = max(0, reduce_pat - epochs_since_best) if reduce_pat else None

    phase = "idle"
    if running:
        phase = "running"
    elif job_status == "pending":
        phase = "queued"
    elif job_status == "completed":
        phase = "done"
    elif job_status == "failed":
        phase = "error"
    elif job_status == "cancelled":
        phase = "cancelled"
    elif hist_epoch > 0:
        phase = "done"

    # Freeze clocks when not running — do not advertise a stale ETA.
    if phase not in ("running", "queued"):
        remaining = (
            (0.0 if elapsed else None) if phase in ("done", "error", "cancelled") else None
        )

    job_error: str | None = None
    if train_job and job_status == "failed":
        err = str(train_job.get("error") or "").strip()
        job_error = err or None

    return _json_safe({
        "project_dir": str(project_dir),
        "phase": phase,
        "job_id": train_job.get("id") if train_job else None,
        "job_status": job_status,
        "job_error": job_error,
        "model_name": model_name,
        "model_dir": str(model_dir) if model_dir else None,
        "monitor": monitor,
        "epoch": current_epoch,
        "epochs": total_epochs,
        "batch": batch,
        "batches": batches_i,
        "batch_progress": batch_pct,
        "metrics": metrics,
        "history": history,
        "best_value": best_value,
        "best_epoch": best_epoch,
        "elapsed_sec": elapsed,
        "remaining_sec": remaining if isinstance(remaining, (int, float)) else None,
        "started_at": started_at,
        "checkpoint": ckpt,
        "early_stopping": {
            "patience": early_pat,
            "epochs_since_best": epochs_since_best,
            "remaining": early_left,
        },
        "reduce_lr": {
            "patience": reduce_pat,
            "epochs_since_best": reduce_wait,
            "in_epochs": reduce_in,
            "source": "keras" if live_reduce is not None else "estimate",
        },
        "dataset": {
            "compression": compression,
            "accelerator": accel_label,
            "batch_size": batch_size,
            "n_batch_train": n_batch or batches_i,
        },
        "can_stop": job_status in ("running", "pending")
        and bool(train_job and train_job.get("id")),
        "can_open_folder": bool(model_dir and Path(model_dir).is_dir()),
    })


def get_project_train_monitor(project_id: str) -> dict[str, Any]:
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    jobs = list_all_jobs(project_dir=str(project_dir), limit=200)
    accelerator: dict[str, Any] = {}
    try:
        from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

        accelerator = get_cached_accelerator_summary()
    except Exception:  # noqa: BLE001 — monitor probe is best-effort
        accelerator = {}
    return inspect_train_monitor(
        project_dir,
        orcai_name=str(project.get("orcai_name") or "orcai-v1"),
        jobs=jobs,
        accelerator=accelerator,
    )
