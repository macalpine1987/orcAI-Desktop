"""Training monitor snapshot for (m14)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.store import list_all_jobs
from orcai_desktop_sidecar.store_db import db_session, project_db_path_existing
from orcai_desktop_sidecar.train_live import LIVE_STATE_NAME, read_live_state
from orcai_desktop_sidecar.train_monitor_helpers import (
    _accel_label,
    _checkpoint_info,
    _history_from_file,
    _json_safe,
    _latest_job_for_commands,
    _latest_train_job,
    _merge_history,
    _model_dir_from_job,
    _read_json,
    _require_project,
    _resolve_compression,
)

_MONITOR_RESPONSE_CACHE: dict[str, tuple[tuple[Any, ...], dict[str, Any]]] = {}


def _jobs_stamp(db_path: Path) -> tuple[int, float]:
    if not db_path.is_file():
        return (0, 0.0)
    try:
        with db_session(db_path) as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), 0) AS m FROM jobs"
            ).fetchone()
        return (int(row["c"] or 0), float(row["m"] or 0.0))
    except Exception:  # noqa: BLE001 — stamp probe is best-effort
        return (0, 0.0)


def _stat_stamp(path: Path) -> tuple[float, int]:
    try:
        st = path.stat()
        return (float(st.st_mtime), int(st.st_size))
    except OSError:
        return (0.0, 0)


def _monitor_disk_stamp(
    project_dir: Path,
    *,
    orcai_name: str,
    prev_snap: dict[str, Any] | None,
) -> tuple[Any, ...]:
    param_path = project_dir / f"{orcai_name}_orcai_parameter.json"
    models_dir = project_dir / "models"
    default_model_dir = models_dir / orcai_name
    default_keras = default_model_dir / f"{orcai_name}.keras"
    prev_model = ""
    if isinstance(prev_snap, dict):
        prev_model = str(prev_snap.get("model_dir") or "")
    prev_model_dir = Path(prev_model) if prev_model else None
    prev_keras = (
        prev_model_dir / f"{prev_model_dir.name}.keras" if prev_model_dir else None
    )
    live_candidates = [
        project_dir / LIVE_STATE_NAME,
        default_model_dir / LIVE_STATE_NAME,
    ]
    if prev_model_dir is not None:
        live_candidates.append(prev_model_dir / LIVE_STATE_NAME)
    history_candidates = [
        project_dir / "training_history.json",
        default_model_dir / "training_history.json",
    ]
    if prev_model_dir is not None:
        history_candidates.append(prev_model_dir / "training_history.json")
    from orcai_desktop_sidecar import store as store_mod

    app_db = Path(store_mod._APP_DIR) / "app.db"
    return (
        _jobs_stamp(app_db),
        _jobs_stamp(project_db_path_existing(project_dir)),
        _stat_stamp(param_path),
        _stat_stamp(models_dir),
        tuple(_stat_stamp(p) for p in live_candidates),
        tuple(_stat_stamp(p) for p in history_candidates),
        _stat_stamp(default_keras),
        _stat_stamp(prev_keras) if prev_keras is not None else (0.0, 0),
    )

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
    orcai_name = str(project.get("orcai_name") or "orcai-v1")
    cached = _MONITOR_RESPONSE_CACHE.get(project_id)
    prev_snap = cached[1] if cached else None
    stamp = _monitor_disk_stamp(
        project_dir, orcai_name=orcai_name, prev_snap=prev_snap
    )
    if cached is not None and cached[0] == stamp:
        return cached[1]

    jobs = list_all_jobs(project_dir=str(project_dir), limit=200)
    accelerator: dict[str, Any] = {}
    try:
        from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

        accelerator = get_cached_accelerator_summary()
    except Exception:  # noqa: BLE001 — monitor probe is best-effort
        accelerator = {}
    snap = inspect_train_monitor(
        project_dir,
        orcai_name=orcai_name,
        jobs=jobs,
        accelerator=accelerator,
    )
    # Recompute stamp after inspect so live files written mid-call still miss cache.
    stamp = _monitor_disk_stamp(
        project_dir, orcai_name=orcai_name, prev_snap=snap
    )
    _MONITOR_RESPONSE_CACHE[project_id] = (stamp, snap)
    return snap
