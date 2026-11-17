from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.schemas import (
    ModelsCompatibilityBody,
    ModelsExportBody,
    ModelsImportBody,
)

router = APIRouter()


@router.get("/v1/models")
async def models_list(project_dir: str | None = None) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import list_models_studio

    models = await asyncio.to_thread(list_models_studio, project_dir)
    return {"models": models}


def _models_detail_sync(model_id: str, project_dir: str | None) -> dict[str, Any]:
    from orcai_desktop_sidecar.model_studio import get_model_detail

    return get_model_detail(model_id, project_dir)


@router.get("/v1/models/detail")
async def models_detail(
    model_id: str,
    project_dir: str | None = None,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    try:
        return await asyncio.to_thread(_models_detail_sync, model_id, project_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _models_compatibility_sync(body: ModelsCompatibilityBody) -> dict[str, Any]:
    from orcai_desktop_sidecar.model_studio import (
        compare_compatibility,
        resolve_model_dir,
    )

    model_dir = resolve_model_dir(body.model_id, body.project_dir)
    if model_dir is None:
        raise FileNotFoundError(f"Model not found: {body.model_id}")
    return compare_compatibility(model_dir, Path(body.project_dir))


@router.post("/v1/models/compatibility")
async def models_compatibility(body: ModelsCompatibilityBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    try:
        return await asyncio.to_thread(_models_compatibility_sync, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/v1/models/import")
async def models_import(body: ModelsImportBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import import_model_directory

    try:
        return await asyncio.to_thread(
            import_model_directory,
            body.source_dir,
            body.project_dir,
            dest_name=body.dest_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/v1/models/export")
async def models_export(body: ModelsExportBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import export_model_directory

    try:
        return await asyncio.to_thread(
            export_model_directory,
            body.model_id,
            body.dest_parent,
            project_dir=body.project_dir,
            dest_name=body.dest_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
