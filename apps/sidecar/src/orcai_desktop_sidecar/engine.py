"""Manual start/stop and device selection for the orcAI / TensorFlow stack."""

from __future__ import annotations

import logging
import multiprocessing
import os
import threading
import time
from typing import Any, Literal

_log = logging.getLogger(__name__)

EngineStatus = Literal["idle", "warming", "ready", "unavailable", "error"]
EngineStage = Literal[
    "idle",
    "checking_orcai",
    "importing_orcai",
    "configuring_device",
    "loading_tensorflow",
    "probing_gpu",
    "ready",
    "error",
]

_STAGE_PROGRESS: dict[EngineStage, float] = {
    "idle": 0.0,
    "checking_orcai": 0.08,
    "importing_orcai": 0.28,
    "configuring_device": 0.48,
    "loading_tensorflow": 0.68,
    "probing_gpu": 0.88,
    "ready": 1.0,
    "error": 0.0,
}

_lock = threading.Lock()
_status: EngineStatus = "idle"
_error: str | None = None
_device: str = "cpu"
_stage: EngineStage = "idle"
_progress: float = 0.0
_gpu_backend: str | None = None
_gpu_devices: list[str] = []
_warmup_generation = 0
_started = False
_accel_summary_cache: dict[str, Any] | None = None
_active_device: str | None = None

_engine_proc: multiprocessing.Process | None = None
_engine_conn: Any = None
_probe_cache: dict[str, Any] | None = None


def _mp_context() -> multiprocessing.context.BaseContext:
    return multiprocessing.get_context("spawn")


def configured_compute_device_for_jobs() -> str:
    """Device selected for predict/train job workers (matches warmed engine when ready)."""
    with _lock:
        if _status == "ready":
            return _device
    return os.environ.get("ORCAI_COMPUTE_DEVICE", "cpu")


def _apply_compute_device(compute_device: str) -> str:
    from orcai_desktop_sidecar.compute_device import apply_compute_device_env

    global _device
    device = apply_compute_device_env(compute_device)
    with _lock:
        _device = device
    return device


def _set_stage_unlocked(stage: EngineStage) -> None:
    global _stage, _progress
    _stage = stage
    _progress = _STAGE_PROGRESS.get(stage, 0.0)


def _set_stage(stage: EngineStage) -> None:
    with _lock:
        _set_stage_unlocked(stage)


def engine_status() -> tuple[EngineStatus, str | None, str]:
    with _lock:
        return _status, _error, _device


def engine_runtime_info() -> dict[str, Any]:
    """Progress fields for /health (UI runtime bar, engine segment 30–100%)."""
    with _lock:
        return {
            "engine": _status,
            "engine_error": _error,
            "compute_device": _device,
            "engine_stage": _stage,
            "engine_progress": _progress,
        }


def gpu_info() -> dict[str, Any]:
    with _lock:
        return {
            "gpu_backend": _gpu_backend,
            "gpu_devices": list(_gpu_devices),
        }


def _shutdown_engine_process(*, wait_s: float = 15.0) -> None:
    global _engine_proc, _engine_conn, _active_device
    proc = _engine_proc
    conn = _engine_conn
    _engine_proc = None
    _engine_conn = None
    _active_device = None

    if conn is not None:
        try:
            if conn.poll(0.2):
                conn.recv()
            conn.send("stop")
        except (EOFError, BrokenPipeError, OSError):
            pass
        try:
            conn.close()
        except OSError:
            _log.debug("engine conn.close failed during stop", exc_info=True)

    if proc is None:
        return

    if proc.is_alive():
        proc.join(timeout=wait_s)
    if proc.is_alive():
        proc.terminate()
        proc.join(timeout=5)
    if proc.is_alive():
        proc.kill()
        proc.join(timeout=2)


def _tensorflow_probe_subprocess() -> dict[str, Any]:
    global _probe_cache
    if _probe_cache is not None:
        return dict(_probe_cache)

    from orcai_desktop_sidecar.engine_worker import run_tensorflow_probe

    ctx = _mp_context()
    queue: multiprocessing.Queue = ctx.Queue()
    proc = ctx.Process(
        target=run_tensorflow_probe,
        args=(queue,),
        daemon=True,
        name="orcai-tf-probe",
    )
    proc.start()
    proc.join(timeout=120)
    if proc.is_alive():
        proc.terminate()
        proc.join(timeout=3)
        payload = {
            "tensorflow_version": None,
            "gpu_devices": [],
            "gpu_backend": None,
            "metal_plugin_installed": False,
            "gpu_available": False,
            "accelerator_hint": "GPU",
            "error": "TensorFlow probe timed out",
        }
        _probe_cache = payload
        return dict(payload)

    try:
        payload = queue.get_nowait()
    except Exception as exc:  # noqa: BLE001 — TF probe IPC; error surfaced to caller
        payload = {
            "ok": False,
            "error": str(exc),
            "tensorflow_version": None,
            "gpu_devices": [],
            "gpu_backend": None,
            "metal_plugin_installed": False,
            "gpu_available": False,
            "accelerator_hint": "GPU",
        }

    if not payload.get("ok", True):
        result = {
            "tensorflow_version": payload.get("tensorflow_version"),
            "gpu_devices": payload.get("gpu_devices", []),
            "gpu_backend": payload.get("gpu_backend"),
            "metal_plugin_installed": payload.get("metal_plugin_installed", False),
            "gpu_available": payload.get("gpu_available", False),
            "accelerator_hint": payload.get("accelerator_hint", "GPU"),
            "error": payload.get("error"),
        }
    else:
        result = {
            "tensorflow_version": payload.get("tensorflow_version"),
            "gpu_devices": payload.get("gpu_devices", []),
            "gpu_backend": payload.get("gpu_backend"),
            "metal_plugin_installed": payload.get("metal_plugin_installed", False),
            "gpu_available": payload.get("gpu_available", False),
            "accelerator_hint": payload.get("accelerator_hint", "GPU"),
        }
    _probe_cache = result
    return dict(result)


def tensorflow_accelerator_summary() -> dict[str, Any]:
    """Inspect TF without starting the engine (subprocess probe; parent stays clean)."""
    return _tensorflow_probe_subprocess()


def _runtime_accelerator_summary() -> dict[str, Any] | None:
    """Summary matching the active engine session (CPU hides GPU devices)."""
    with _lock:
        if _status != "ready":
            return None
        dev = _device
        gpu_devices = list(_gpu_devices)
        gpu_backend = _gpu_backend
        probe = dict(_probe_cache or _tensorflow_probe_subprocess())

    if dev == "cpu":
        return {
            **probe,
            "active_compute_device": "cpu",
            "accelerator_hint": "CPU",
            "gpu_available": False,
            "gpu_devices": [],
            "gpu_backend": None,
        }
    return {
        **probe,
        "active_compute_device": "gpu",
        "accelerator_hint": probe.get("accelerator_hint", "GPU"),
        "gpu_available": len(gpu_devices) > 0,
        "gpu_devices": gpu_devices,
        "gpu_backend": gpu_backend,
    }


def get_cached_accelerator_summary(*, refresh: bool = False) -> dict[str, Any]:
    """Cached TF probe — avoids repeated subprocess probes on every /v1/capabilities poll."""
    global _accel_summary_cache, _probe_cache
    runtime = _runtime_accelerator_summary()
    if runtime is not None:
        with _lock:
            _accel_summary_cache = runtime
        return dict(runtime)
    if refresh:
        _probe_cache = None
    with _lock:
        if refresh or _accel_summary_cache is None:
            _accel_summary_cache = tensorflow_accelerator_summary()
        cached = _accel_summary_cache
    return dict(cached) if cached is not None else {}


def invalidate_accelerator_cache() -> None:
    global _accel_summary_cache, _probe_cache
    _accel_summary_cache = None
    _probe_cache = None


def stop_engine() -> None:
    global _warmup_generation, _status, _error, _device, _started, _gpu_backend, _gpu_devices
    invalidate_accelerator_cache()
    _shutdown_engine_process()
    with _lock:
        _warmup_generation += 1
        _status = "idle"
        _error = None
        _device = "cpu"
        _gpu_backend = None
        _gpu_devices = []
        _started = False
        _set_stage_unlocked("idle")


def _watch_engine_process(
    proc: multiprocessing.Process,
    conn: Any,
    generation: int,
) -> None:
    global _status, _error, _gpu_backend, _gpu_devices, _active_device

    try:
        if not conn.poll(600):
            raise TimeoutError("Engine warmup timed out")
        msg = conn.recv()
    except Exception as exc:  # noqa: BLE001 — engine IPC; error stored for UI status
        msg = {"status": "error", "error": str(exc)}

    with _lock:
        if generation != _warmup_generation:
            return
        if msg.get("status") == "ready":
            _status = "ready"
            _error = None
            _gpu_devices = list(msg.get("gpu_devices") or [])
            _gpu_backend = msg.get("gpu_backend")
            _active_device = str(msg.get("device") or _device)
            _set_stage_unlocked("ready")
        else:
            _shutdown_engine_process()
            _status = "error"
            _error = str(msg.get("error") or "Engine warmup failed")
            _gpu_backend = None
            _gpu_devices = []
            _active_device = None
            _set_stage_unlocked("error")

    if msg.get("status") == "ready":
        get_cached_accelerator_summary(refresh=True)
        threading.Thread(
            target=_engine_process_watchdog,
            args=(proc, generation),
            daemon=True,
            name="orcai-engine-watchdog",
        ).start()
    elif proc.is_alive():
        _shutdown_engine_process()


def _engine_process_watchdog(proc: multiprocessing.Process, generation: int) -> None:
    """Mark engine error if the warmup child exits unexpectedly."""
    global _status, _error, _gpu_backend, _gpu_devices, _active_device

    while True:
        time.sleep(2.0)
        with _lock:
            if generation != _warmup_generation:
                return
            if _status != "ready":
                return
        if proc.is_alive():
            continue
        with _lock:
            if generation != _warmup_generation or _status != "ready":
                return
            _status = "error"
            _error = "Engine process exited unexpectedly"
            _gpu_backend = None
            _gpu_devices = []
            _active_device = None
            _set_stage_unlocked("error")
        invalidate_accelerator_cache()
        _shutdown_engine_process()
        return


def start_engine_warmup(compute_device: str = "cpu") -> None:
    global _warmup_generation, _status, _error, _device, _started, _gpu_backend, _gpu_devices
    from orcai_desktop_sidecar.engine_worker import run_engine_session
    from orcai_desktop_sidecar.runner import orcai_available

    if not orcai_available():
        with _lock:
            _status = "unavailable"
            _error = "orcai package is not installed"
            _set_stage_unlocked("error")
        return

    device = _apply_compute_device(compute_device)

    with _lock:
        if _status == "ready" and _device == device and _active_device == device:
            return
        _warmup_generation += 1
        generation = _warmup_generation
        _status = "warming"
        _error = None
        _device = device
        _gpu_backend = None
        _gpu_devices = []
        _started = True
        _set_stage_unlocked("checking_orcai")

    invalidate_accelerator_cache()
    _shutdown_engine_process()

    ctx = _mp_context()
    parent_conn, child_conn = ctx.Pipe(duplex=True)
    proc = ctx.Process(
        target=run_engine_session,
        args=(device, child_conn),
        daemon=True,
        name="orcai-engine",
    )
    global _engine_proc, _engine_conn
    _engine_proc = proc
    _engine_conn = parent_conn

    _set_stage("configuring_device")
    proc.start()
    child_conn.close()

    thread = threading.Thread(
        target=_watch_engine_process,
        args=(proc, parent_conn, generation),
        daemon=True,
        name="orcai-engine-watch",
    )
    thread.start()
