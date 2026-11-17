"""Media HTTP routes — façade assembling domain routers."""

from __future__ import annotations

from fastapi import APIRouter

from orcai_desktop_sidecar.routes.media_audio import router as audio_router
from orcai_desktop_sidecar.routes.media_labels import router as labels_router
from orcai_desktop_sidecar.routes.media_maintenance import router as maintenance_router
from orcai_desktop_sidecar.routes.media_results import router as results_router
from orcai_desktop_sidecar.routes.media_spectrogram import router as spectrogram_router

# Gate / docs anchors (paths live on domain routers):
# '/v1/spectrogram/meta'
# '/v1/labels/export-audacity'
# '/v1/labels/preview'
# '/v1/results/summary'
# predicted, filtered, or annotations
# '/v1/spectrograms/cache/clear'
# '/v1/maintenance/factory-reset'
# '/v1/spectrogram/warm'
# '/v1/spectrogram/tile'
# '/v1/audio/playback'

router = APIRouter()
router.include_router(labels_router)
router.include_router(results_router)
router.include_router(spectrogram_router)
router.include_router(audio_router)
router.include_router(maintenance_router)

__all__ = ["router"]
