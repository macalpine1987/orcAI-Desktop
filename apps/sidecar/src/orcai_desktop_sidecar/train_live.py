"""Live train metrics for Desktop monitor without forking orcAI.

Hooks ``keras.Model.fit`` for the duration of ``orcai.train.train`` to append a
callback that mirrors history onto disk and job.progress (epoch + batch).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)

LIVE_STATE_NAME = "desktop_train_monitor.json"

_lock = threading.Lock()
_fit_patch_depth = 0
_orig_fit: Any | None = None


def reduce_lr_epochs_until(
    *,
    wait: int,
    patience: int,
    cooldown: int = 0,
    at_min_lr: bool = False,
) -> int | None:
    """Epochs until ``ReduceLROnPlateau`` can fire, from that callback's counters.

    Early-stopping ``epochs_since_best`` is a different counter: a learning-rate
    drop resets ReduceLR's ``wait`` and starts ``cooldown``, while early stop
    keeps counting the same plateau.
    """
    if at_min_lr or patience <= 0:
        return None
    wait_i = max(0, int(wait))
    patience_i = int(patience)
    cooldown_i = max(0, int(cooldown))
    remaining = max(0, patience_i - wait_i)
    if cooldown_i > 0:
        return cooldown_i + remaining
    return remaining


def read_reduce_lr_callback(
    model: Any,
    current_lr: float | None = None,
) -> dict[str, Any] | None:
    """Read Keras ``ReduceLROnPlateau`` after its ``on_epoch_end`` has run."""
    if model is None:
        return None
    callbacks: list[Any] = []
    for attr in ("callbacks", "_callbacks"):
        raw = getattr(model, attr, None)
        if raw is None:
            continue
        inner = getattr(raw, "callbacks", None)
        if isinstance(inner, (list, tuple)):
            callbacks.extend(inner)
        elif isinstance(raw, (list, tuple)):
            callbacks.extend(raw)
    for cb in callbacks:
        if type(cb).__name__ != "ReduceLROnPlateau":
            continue
        wait = int(getattr(cb, "wait", 0) or 0)
        patience = int(getattr(cb, "patience", 0) or 0)
        cooldown = int(getattr(cb, "cooldown_counter", 0) or 0)
        try:
            min_lr = float(getattr(cb, "min_lr", 0) or 0)
        except (TypeError, ValueError):
            min_lr = 0.0
        at_min = current_lr is not None and current_lr <= min_lr + 1e-12
        return {
            "wait": wait,
            "patience": patience,
            "cooldown": cooldown,
            "min_lr": min_lr,
            "at_min_lr": at_min,
            "in_epochs": reduce_lr_epochs_until(
                wait=wait,
                patience=patience,
                cooldown=cooldown,
                at_min_lr=at_min,
            ),
        }
    return None


def live_state_path(model_dir: Path) -> Path:
    return Path(model_dir) / LIVE_STATE_NAME


def read_live_state(model_dir: Path | None) -> dict[str, Any] | None:
    if model_dir is None:
        return None
    path = live_state_path(Path(model_dir))
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def reset_train_monitor_session(
    *,
    job_id: str,
    model_dir: Path,
    epochs: int,
    batches_per_epoch: int | None,
    monitor_metric: str,
    early_stopping_patience: int | None = None,
) -> Path:
    """Wipe live monitor state for a new train job (same project / model_dir).

    Clears the previous run's curve so the Desktop monitor does not stitch old
    ``training_history.json`` into the new session.
    """
    model_dir = Path(model_dir)
    now = time.time()
    path = live_state_path(model_dir)
    _write_state(
        path,
        {
            "job_id": str(job_id),
            "model_dir": str(model_dir),
            "epoch": 0,
            "epochs": max(1, int(epochs) or 1),
            "batch": 0,
            "batches": batches_per_epoch,
            "metrics": {},
            "history": {},
            "monitor": monitor_metric or "val_MBA",
            "best_value": None,
            "best_epoch": None,
            "epochs_since_best": 0,
            "early_stopping_patience": early_stopping_patience,
            "started_at": now,
            "updated_at": now,
            "elapsed_sec": 0.0,
            "remaining_sec": None,
            "session_reset": True,
        },
    )
    return path


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(path)
    except OSError:
        _log.debug("train live state write failed", exc_info=True)


def _append_history(history: dict[str, list[Any]], logs: dict[str, Any]) -> None:
    for key, value in logs.items():
        if key in ("batch", "size"):
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            continue
        history.setdefault(key, []).append(num)


def install_train_fit_hook(
    *,
    job_id: str,
    model_dir: Path,
    epochs: int,
    batches_per_epoch: int | None,
    monitor_metric: str,
    early_stopping_patience: int | None = None,
) -> Any:
    """Patch ``keras.Model.fit`` to inject a Desktop live-metrics callback."""
    global _fit_patch_depth, _orig_fit
    import keras

    model_dir = Path(model_dir)
    epochs_i = max(1, int(epochs) or 1)
    batches_i = (
        int(batches_per_epoch) if batches_per_epoch and batches_per_epoch > 0 else None
    )
    monitor = monitor_metric or "val_MBA"
    early_pat = (
        int(early_stopping_patience)
        if early_stopping_patience and int(early_stopping_patience) > 0
        else None
    )
    state_path = live_state_path(model_dir)
    # New train in the same model_dir → clear previous live curve immediately.
    reset_train_monitor_session(
        job_id=job_id,
        model_dir=model_dir,
        epochs=epochs_i,
        batches_per_epoch=batches_i,
        monitor_metric=monitor,
        early_stopping_patience=early_pat,
    )

    def _optimizer_lr(model: Any) -> float | None:
        try:
            opt = getattr(model, "optimizer", None)
            if opt is None:
                return None
            lr = getattr(opt, "learning_rate", None)
            if lr is None:
                lr = getattr(opt, "lr", None)
            if lr is None:
                return None
            if hasattr(lr, "numpy"):
                return float(lr.numpy())
            try:
                import keras.backend as K

                return float(K.get_value(lr))
            except Exception:  # noqa: BLE001 — live parse is best-effort
                return float(lr)
        except Exception:  # noqa: BLE001 — live parse is best-effort
            return None

    def _normalize_metrics(raw: dict[str, float]) -> dict[str, float]:
        out = dict(raw)
        if "learning_rate" not in out and "lr" in out:
            out["learning_rate"] = out["lr"]
        return out

    class DesktopTrainMonitorCallback(keras.callbacks.Callback):
        _desktop_train_monitor = True

        def __init__(self) -> None:
            super().__init__()
            self.job_id = job_id
            self.model_dir = model_dir
            self.epochs = epochs_i
            self.batches_per_epoch = batches_i
            self.monitor_metric = monitor
            self.early_pat = early_pat
            self.started_at = time.time()
            self.history: dict[str, list[Any]] = {}
            self.epoch = 0
            self.batch = 0
            self.best_value: float | None = None
            self.best_epoch: int | None = None
            self.epochs_since_best = 0
            self.last_logs: dict[str, float] = {}
            self._path = state_path
            self._last_flush_at = 0.0

        def on_train_begin(self, logs: Any = None) -> None:
            params = getattr(self, "params", None) or {}
            auto_epochs = params.get("epochs") if isinstance(params, dict) else None
            if isinstance(auto_epochs, int) and auto_epochs > 0:
                self.epochs = auto_epochs
            steps = params.get("steps") if isinstance(params, dict) else None
            if isinstance(steps, int) and steps > 0:
                self.batches_per_epoch = steps
            self._flush(batch=0)

        def on_epoch_begin(self, epoch: int, logs: Any = None) -> None:
            self._abort_if_cancelled()
            self.epoch = int(epoch) + 1
            self.batch = 0
            self._flush(batch=0)

        def on_train_batch_end(self, batch: int, logs: Any = None) -> None:
            self._abort_if_cancelled()
            self.batch = int(batch) + 1
            # Mid-epoch: refresh train-side metrics from Keras batch logs.
            # Keep last val_* until on_epoch_end (validation runs once per epoch).
            raw = logs if isinstance(logs, dict) else {}
            for key, value in raw.items():
                name = str(key)
                if name in ("batch", "size") or name.startswith("val_"):
                    continue
                try:
                    self.last_logs[name] = float(value)
                except (TypeError, ValueError):
                    continue
            self.last_logs = _normalize_metrics(self.last_logs)
            lr = _optimizer_lr(self.model)
            if lr is not None:
                self.last_logs["learning_rate"] = lr
            now = time.time()
            # ~1 Hz live updates + first batch of each epoch (smooth progress / ETA).
            if (
                self.batch == 1
                or self.batch % 5 == 0
                or (now - self._last_flush_at) >= 1.0
            ):
                self._flush(batch=self.batch)
                self._set_progress()

        def on_test_batch_end(self, batch: int, logs: Any = None) -> None:
            # Keras calls this as on_test_batch_end(batch, logs=logs). The names
            # must stay `batch` and `logs`; a rename breaks validation.
            del batch, logs
            self._abort_if_cancelled()

        def on_epoch_end(self, epoch: int, logs: Any = None) -> None:
            self._abort_if_cancelled()
            self.epoch = int(epoch) + 1
            raw = logs if isinstance(logs, dict) else {}
            numeric: dict[str, float] = {}
            for key, value in raw.items():
                try:
                    numeric[str(key)] = float(value)
                except (TypeError, ValueError):
                    continue
            numeric = _normalize_metrics(numeric)
            lr = _optimizer_lr(self.model)
            if lr is not None:
                numeric["learning_rate"] = lr
            self.last_logs = numeric
            _append_history(self.history, numeric)
            metric = numeric.get(self.monitor_metric)
            if metric is not None:
                if self.best_value is None or metric > self.best_value:
                    self.best_value = metric
                    self.best_epoch = self.epoch
                    self.epochs_since_best = 0
                else:
                    self.epochs_since_best += 1
            batches = self.batches_per_epoch or self.batch
            self.batch = batches
            self._flush(batch=batches)
            self._set_progress()

        def on_train_end(self, logs: Any = None) -> None:
            self._flush(batch=self.batch)
            self._set_progress(done=True)

        def _abort_if_cancelled(self) -> None:
            from orcai_desktop_sidecar.job_cancel import JobCancelled, check

            try:
                check(self.job_id)
            except JobCancelled:
                self.model.stop_training = True
                raise

        def _set_progress(self, *, done: bool = False) -> None:
            try:
                from orcai_desktop_sidecar.jobs import set_progress
            except Exception:  # noqa: BLE001 — live parse is best-effort
                return
            if done:
                set_progress(self.job_id, 1.0)
                return
            epochs = max(1, self.epochs)
            epoch_idx = max(0, self.epoch - 1)
            frac_epoch = epoch_idx / epochs
            if self.batches_per_epoch and self.batches_per_epoch > 0:
                frac_epoch += min(1.0, self.batch / self.batches_per_epoch) / epochs
            else:
                frac_epoch = self.epoch / epochs
            set_progress(self.job_id, max(0.0, min(0.99, frac_epoch)))

        def _estimate_remaining(self, *, batch: int, elapsed: float) -> float | None:
            epochs = max(1, self.epochs)
            inner = (
                min(1.0, batch / self.batches_per_epoch)
                if self.batches_per_epoch
                else 0.0
            )
            epoch_idx = max(0, self.epoch - 1)
            frac = (epoch_idx + inner) / epochs
            if self.epoch <= 1:
                if self.batches_per_epoch and batch <= max(
                    10, self.batches_per_epoch // 20
                ):
                    if frac < 0.05:
                        return None
                elif frac < 0.05:
                    return None
            if frac <= 0.01:
                return None
            rem_full = elapsed * (1.0 - frac) / frac
            # Cap by early-stopping horizon (no further improvements).
            if self.early_pat is not None:
                es_left = max(0, self.early_pat - self.epochs_since_best)
                units = (1.0 - inner) + float(es_left)
                done_units = epoch_idx + inner
                if done_units > 0.02 and units >= 0:
                    rem_es = elapsed * units / done_units
                    return min(rem_full, rem_es)
            return rem_full

        def _flush(self, *, batch: int) -> None:
            elapsed = max(0.0, time.time() - self.started_at)
            remaining = self._estimate_remaining(batch=batch, elapsed=elapsed)
            metrics = _normalize_metrics(dict(self.last_logs))
            lr = _optimizer_lr(self.model)
            if lr is not None:
                metrics["learning_rate"] = lr
            reduce_lr = read_reduce_lr_callback(
                self.model, metrics.get("learning_rate")
            )

            payload = {
                "job_id": self.job_id,
                "model_dir": str(self.model_dir),
                "epoch": self.epoch,
                "epochs": self.epochs,
                "batch": batch,
                "batches": self.batches_per_epoch,
                "metrics": metrics,
                "history": {k: list(v) for k, v in self.history.items()},
                "monitor": self.monitor_metric,
                "best_value": self.best_value,
                "best_epoch": self.best_epoch,
                "epochs_since_best": self.epochs_since_best,
                "early_stopping_patience": self.early_pat,
                "reduce_lr": reduce_lr,
                "started_at": self.started_at,
                "updated_at": time.time(),
                "elapsed_sec": elapsed,
                "remaining_sec": remaining,
            }
            _write_state(self._path, payload)
            self._last_flush_at = time.time()

    callback = DesktopTrainMonitorCallback()

    with _lock:
        _fit_patch_depth += 1
        if _orig_fit is None:
            _orig_fit = keras.Model.fit

            def patched_fit(self: Any, *args: Any, **kwargs: Any) -> Any:
                cbs = list(kwargs.get("callbacks") or [])
                if not any(getattr(c, "_desktop_train_monitor", False) for c in cbs):
                    cbs.append(callback)
                kwargs["callbacks"] = cbs
                assert _orig_fit is not None
                return _orig_fit(self, *args, **kwargs)

            keras.Model.fit = patched_fit  # type: ignore[method-assign]

    def restore() -> None:
        global _fit_patch_depth, _orig_fit
        with _lock:
            _fit_patch_depth = max(0, _fit_patch_depth - 1)
            if _fit_patch_depth == 0 and _orig_fit is not None:
                try:
                    keras.Model.fit = _orig_fit  # type: ignore[method-assign]
                except Exception:  # noqa: BLE001 — live parse is best-effort
                    _log.debug("restore Model.fit failed", exc_info=True)
                _orig_fit = None

    return restore
