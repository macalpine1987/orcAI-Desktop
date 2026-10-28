"""Compute device (CPU/GPU) for engine warmup and job workers.

On macOS, ``CUDA_VISIBLE_DEVICES=-1`` does **not** hide Metal. Callers must also
run :func:`configure_tensorflow_for_device` immediately after importing
TensorFlow so CPU mode truly has no visible GPUs (orcAI ``train`` hardcodes
``tf.device("/GPU:0")`` and would otherwise use Metal).
"""

from __future__ import annotations

import logging
import os
from typing import Literal

_log = logging.getLogger(__name__)

ComputeDevice = Literal["cpu", "gpu"]


def normalize_compute_device(compute_device: str | None) -> ComputeDevice:
    device = (compute_device or "cpu").strip().lower()
    if device not in ("cpu", "gpu"):
        return "cpu"
    return device  # type: ignore[return-value]


def apply_compute_device_env(compute_device: str | None) -> ComputeDevice:
    """Set process env before TensorFlow is imported."""
    device = normalize_compute_device(compute_device)
    os.environ["ORCAI_COMPUTE_DEVICE"] = device
    if device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
        # Extra belt for some TF builds; Metal still needs set_visible_devices.
        os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
    else:
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)
    return device


def configure_tensorflow_for_device(compute_device: str | None) -> list[str]:
    """Import-safe TF setup. Must run before orcAI builds graphs/models.

    CPU: hide all GPUs (incl. Metal). GPU: enable memory growth.
    Returns visible GPU device names (empty on CPU).
    """
    device = normalize_compute_device(compute_device)
    import tensorflow as tf

    # orcAI train uses ``with tf.device("/GPU:0")``; soft placement lets that
    # fall back to CPU when no GPU is visible instead of hard-failing.
    try:
        tf.config.set_soft_device_placement(True)
    except Exception:  # noqa: BLE001 — older TF
        _log.debug("set_soft_device_placement failed", exc_info=True)

    if device == "cpu":
        try:
            tf.config.set_visible_devices([], "GPU")
        except Exception:  # noqa: BLE001 — TF may reject if already initialized
            _log.warning(
                "Could not hide GPUs for CPU mode; Metal/CUDA may still be used",
                exc_info=True,
            )
        # orcAI's print_tf_device_info uses list_physical_devices("GPU"), which
        # still lists Metal after set_visible_devices. Mask so logs match reality.
        _orig_list = tf.config.list_physical_devices

        def _list_physical_devices(device_type: str | None = None):
            if device_type == "GPU":
                return []
            devices = _orig_list(device_type) if device_type else _orig_list()
            if device_type is None:
                return [d for d in devices if getattr(d, "device_type", "") != "GPU"]
            return devices

        tf.config.list_physical_devices = _list_physical_devices  # type: ignore[method-assign]
        return []

    gpus = tf.config.list_physical_devices("GPU")
    names: list[str] = []
    for gpu in gpus:
        names.append(gpu.name)
        try:
            tf.config.experimental.set_memory_growth(gpu, True)
        except Exception:  # noqa: BLE001 — already set / unsupported
            _log.debug("set_memory_growth failed for %s", gpu, exc_info=True)
    return names


def resolve_job_compute_device() -> ComputeDevice:
    """Device for a spawned job worker (inherits parent env; engine module is fresh)."""
    from orcai_desktop_sidecar.engine import configured_compute_device_for_jobs

    return normalize_compute_device(configured_compute_device_for_jobs())
