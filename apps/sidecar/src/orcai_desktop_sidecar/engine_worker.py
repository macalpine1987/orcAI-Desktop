"""Isolated TensorFlow + orcAI warmup (separate process for CPU/GPU switching)."""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

_log = logging.getLogger(__name__)


def _apply_compute_device(compute_device: str) -> str:
    from orcai_desktop_sidecar.compute_device import apply_compute_device_env

    return apply_compute_device_env(compute_device)


def _configure_tensorflow(device: str) -> list[str]:
    from orcai_desktop_sidecar.compute_device import configure_tensorflow_for_device

    return configure_tensorflow_for_device(device)


def _platform_accelerator_hint() -> str:
    if sys.platform == "darwin":
        return "Metal (Apple GPU)"
    if sys.platform.startswith("linux"):
        return "CUDA"
    return "GPU"


def _probe_tensorflow_devices() -> tuple[list[str], str | None]:
    import tensorflow as tf

    names: list[str] = []
    backend: str | None = None
    for dev in tf.config.list_physical_devices("GPU"):
        name = dev.name
        names.append(name)
        low = name.lower()
        if "metal" in low or (backend is None and sys.platform == "darwin"):
            backend = "metal"
        elif backend is None:
            backend = "cuda"
    return names, backend


def _metal_plugin_installed() -> bool:
    if sys.platform != "darwin":
        return False
    try:
        from importlib.metadata import PackageNotFoundError, version

        version("tensorflow-metal")
        return True
    except PackageNotFoundError:
        pass
    try:
        import site
        from pathlib import Path

        for base in site.getsitepackages():
            dylib = Path(base) / "tensorflow-plugins" / "libmetal_plugin.dylib"
            if dylib.is_file():
                return True
    except OSError:
        _log.debug("metal plugin dylib probe failed", exc_info=True)
    return False


def run_tensorflow_probe(result_queue: Any) -> None:
    """One-shot TF probe without keeping the interpreter alive in the parent."""
    try:
        _apply_compute_device(os.environ.get("ORCAI_PROBE_DEVICE", "gpu"))
        import tensorflow as tf

        version = tf.__version__
        gpus, backend = _probe_tensorflow_devices()
        metal_pkg = _metal_plugin_installed()
        result_queue.put(
            {
                "ok": True,
                "tensorflow_version": version,
                "gpu_devices": gpus,
                "gpu_backend": backend,
                "metal_plugin_installed": metal_pkg,
                "gpu_available": len(gpus) > 0,
                "accelerator_hint": _platform_accelerator_hint(),
            }
        )
    except Exception as exc:  # noqa: BLE001 — probe boundary; error returned on queue
        result_queue.put(
            {
                "ok": False,
                "error": str(exc),
                "tensorflow_version": None,
                "gpu_devices": [],
                "gpu_backend": None,
                "metal_plugin_installed": False,
                "gpu_available": False,
                "accelerator_hint": _platform_accelerator_hint(),
            }
        )


def run_engine_session(device: str, conn: Any) -> None:
    """Load TF + orcai in a child process; report ready on ``conn``."""
    try:
        dev = _apply_compute_device(device)
        import tensorflow as tf

        gpu_names = _configure_tensorflow(dev)
        import orcai  # noqa: F401

        tf.config.list_physical_devices("GPU" if dev == "gpu" else "CPU")
        _, backend = _probe_tensorflow_devices()

        if dev == "gpu" and not gpu_names:
            hint = _platform_accelerator_hint()
            if sys.platform == "darwin":
                raise RuntimeError(
                    "No GPU device found for TensorFlow. On macOS install the "
                    "Metal plugin (tensorflow-metal) and rebuild the app bundle, "
                    "then restart the engine. CUDA is not available on Mac."
                )
            raise RuntimeError(
                f"No GPU device found for TensorFlow ({hint}). "
                "Use CPU or install CUDA-enabled TensorFlow on Linux/Windows."
            )

        conn.send(
            {
                "status": "ready",
                "device": dev,
                "gpu_devices": gpu_names,
                "gpu_backend": backend if dev == "gpu" else None,
            }
        )
        conn.recv()
    except Exception as exc:  # noqa: BLE001 — engine session; error sent to parent
        try:
            conn.send({"status": "error", "error": str(exc)})
        except Exception:  # noqa: BLE001 — best-effort error report on broken pipe
            _log.debug("engine session failed to send error: %s", exc, exc_info=True)
    finally:
        try:
            conn.close()
        except OSError:
            _log.debug("engine session conn.close failed", exc_info=True)
