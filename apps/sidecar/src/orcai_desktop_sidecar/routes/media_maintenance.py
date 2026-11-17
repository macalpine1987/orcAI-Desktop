from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter

router = APIRouter()

@router.post("/v1/maintenance/factory-reset")
async def maintenance_factory_reset() -> dict[str, Any]:
    """Wipe Desktop SQLite (jobs/projects) and spectrogram cache.

    Does not delete user WAV/annotation folders. Preferences are reset in the UI.
    """
    from orcai_desktop_sidecar.maintenance import factory_reset_desktop

    return await asyncio.to_thread(factory_reset_desktop)
