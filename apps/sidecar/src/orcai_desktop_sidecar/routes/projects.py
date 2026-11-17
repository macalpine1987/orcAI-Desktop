"""Projects HTTP routes — façade assembling domain routers."""

from __future__ import annotations

from fastapi import APIRouter

from orcai_desktop_sidecar.routes.project_routes_crud import router as crud_router
from orcai_desktop_sidecar.routes.project_routes_recordings import (
    projects_delete_recordings_impl,
    schedule_import_audio_job,
)
from orcai_desktop_sidecar.routes.project_routes_recordings import router as recordings_router
from orcai_desktop_sidecar.routes.project_routes_studio import router as studio_router
from orcai_desktop_sidecar.routes.project_routes_train import router as train_router

# Gate / docs anchors (path still live on train_router):
# '/v1/projects/{project_id}/pipeline'

router = APIRouter()
router.include_router(crud_router)
router.include_router(recordings_router)
router.include_router(studio_router)
router.include_router(train_router)

__all__ = [
    "router",
    "schedule_import_audio_job",
    "projects_delete_recordings_impl",
]
