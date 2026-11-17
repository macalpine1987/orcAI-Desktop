from __future__ import annotations

import asyncio
import platform
import sys

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.runner import IMPLEMENTED_COMMANDS
from orcai_desktop_sidecar.runtime_state import ALL_COMMANDS
from orcai_desktop_sidecar.schemas import EngineStartRequest

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    """Keep sync — polled often; engine_runtime_info is lock-local."""
    from orcai_desktop_sidecar.engine import engine_runtime_info

    payload: dict[str, object] = {
        "status": "ok",
        "orcai": "yes" if orcai_available() else "no",
        **engine_runtime_info(),
    }
    return payload


def _engine_start_sync(device: str) -> dict[str, str]:
    from orcai_desktop_sidecar.engine import start_engine_warmup

    start_engine_warmup(device)
    return {"status": "warming", "compute_device": device}


@router.post("/v1/engine/start")
async def engine_start(body: EngineStartRequest) -> dict[str, str]:
    if not orcai_available():
        raise HTTPException(
            status_code=503,
            detail="orcai is not installed in the sidecar environment",
        )
    device = body.compute_device.strip().lower()
    if device not in ("cpu", "gpu"):
        raise HTTPException(status_code=400, detail="compute_device must be cpu or gpu")
    return await asyncio.to_thread(_engine_start_sync, device)


@router.post("/v1/engine/stop")
async def engine_stop() -> dict[str, str]:
    from orcai_desktop_sidecar.engine import stop_engine

    await asyncio.to_thread(stop_engine)
    return {"status": "idle"}


def _capabilities_payload() -> dict[str, object]:
    """Sync build for capabilities (TF probe / join may take up to ~120s)."""
    from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

    orcai_ver = None
    if orcai_available():
        from importlib.metadata import version

        orcai_ver = version("orcai")

    accel = get_cached_accelerator_summary()
    plat = platform.system().lower()
    builtin_models: list[dict[str, str]] = []
    if orcai_available():
        from orcai_desktop_sidecar.adapters.models import list_builtin_models

        builtin_models = list_builtin_models()
    return {
        "platform": plat,
        "python": sys.version.split()[0],
        "multi_gpu_hpsearch": plat == "linux",
        "orcai_installed": orcai_available(),
        "orcai_version": orcai_ver,
        "builtin_models": builtin_models,
        "implemented_commands": sorted(IMPLEMENTED_COMMANDS),
        "supported_commands": ALL_COMMANDS,
        "gpu_available": accel.get("gpu_available", False),
        "gpu_backend": accel.get("gpu_backend"),
        "gpu_devices": accel.get("gpu_devices", []),
        "metal_plugin_installed": accel.get("metal_plugin_installed", False),
        "tensorflow_version": accel.get("tensorflow_version"),
        "accelerator_hint": accel.get("accelerator_hint"),
        "active_compute_device": accel.get("active_compute_device"),
    }


@router.get("/v1/capabilities")
async def capabilities() -> dict[str, object]:
    # Off the event loop: cold TF probe uses Process.join(timeout=120).
    return await asyncio.to_thread(_capabilities_payload)
