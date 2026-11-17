from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.schemas import (
    DeleteRecordingsRequest,
    ImportRecordingsRequest,
    ParameterTextRequest,
)

router = APIRouter()

@router.get("/v1/projects/{project_id}/annotations")
async def projects_annotations(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import annotations_matrix

    try:
        return await asyncio.to_thread(annotations_matrix, project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/v1/projects/{project_id}/annotations/import")
async def projects_import_annotations(
    project_id: str,
    body: ImportRecordingsRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import import_annotations

    try:
        return await asyncio.to_thread(import_annotations, project_id, body.paths)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/v1/projects/{project_id}/annotations/delete")
async def projects_delete_annotations(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import delete_annotations

    names = body.filenames
    if body.delete_all:
        raise HTTPException(
            status_code=400,
            detail="delete_all is not supported for annotations; pass filenames",
        )
    if not names:
        raise HTTPException(status_code=400, detail="filenames required")
    try:
        return await asyncio.to_thread(delete_annotations, project_id, names)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get("/v1/projects/{project_id}/artifacts")
async def projects_artifacts(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import list_artifacts

    try:
        return await asyncio.to_thread(list_artifacts, project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get("/v1/projects/{project_id}/parameters")
async def projects_parameters_get(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import read_parameters

    try:
        return await asyncio.to_thread(read_parameters, project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/v1/projects/{project_id}/parameters/validate")
async def projects_parameters_validate(project_id: str, body: ParameterTextRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import get_project
    from orcai_desktop_sidecar.project_studio import validate_parameters_text

    project = await asyncio.to_thread(get_project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await asyncio.to_thread(validate_parameters_text, body.text)

@router.put("/v1/projects/{project_id}/parameters")
async def projects_parameters_put(project_id: str, body: ParameterTextRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import write_parameters

    try:
        return await asyncio.to_thread(write_parameters, project_id, body.text)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

