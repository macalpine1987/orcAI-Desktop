from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.runtime_state import (
    section_cache_get_or_build,
    summary_cache,
    summary_cache_lock,
)
from orcai_desktop_sidecar.schemas import (
    CreateProjectRequest,
    RegisterProjectRequest,
    UpdateProjectRequest,
)

router = APIRouter()

@router.get("/v1/projects")
async def projects_list() -> dict[str, list[dict[str, Any]]]:
    from orcai_desktop_sidecar.project_registry import list_projects

    projects = await asyncio.to_thread(list_projects)
    return {"projects": projects}

@router.get("/v1/projects/check-name")
async def projects_check_name(
    parent_dir: str,
    display_name: str,
    orcai_name: str | None = None,
    exclude_id: str | None = None,
    display_name_only: bool = False,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import check_project_name_available

    try:
        return await asyncio.to_thread(
            check_project_name_available,
            parent_dir,
            display_name,
            orcai_name=orcai_name,
            exclude_id=exclude_id,
            display_name_only=display_name_only,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/v1/projects/{project_id}")
async def projects_get(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import get_project

    project = await asyncio.to_thread(get_project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

def _projects_summary_sync(project_id: str, fresh: bool) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import compute_project_summary

    return section_cache_get_or_build(
        summary_cache,
        project_id,
        lambda: compute_project_summary(project_id),
        lock=summary_cache_lock,
        fresh=fresh,
    )

@router.get("/v1/projects/{project_id}/summary")
async def projects_summary(project_id: str, fresh: bool = False) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(_projects_summary_sync, project_id, fresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/v1/projects", status_code=201)
async def projects_create(body: CreateProjectRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import (
        ProjectNameConflictError,
        create_project,
    )

    try:
        return await asyncio.to_thread(
            create_project,
            parent_dir=body.parent_dir,
            display_name=body.display_name,
            description=body.description,
            orcai_name=body.orcai_name,
            import_paths=body.import_paths or None,
            project_kind=body.project_kind,
            focus=body.focus,
        )
    except ProjectNameConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_name_conflict", "conflicts": exc.conflicts},
        ) from exc
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/v1/projects/register", status_code=201)
async def projects_register(body: RegisterProjectRequest) -> dict[str, Any]:
    import sqlite3

    from orcai_desktop_sidecar.project_registry import (
        ProjectNameConflictError,
        register_existing_project,
    )

    try:
        return await asyncio.to_thread(
            register_existing_project, body.path, display_name=body.display_name
        )
    except ProjectNameConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_name_conflict", "conflicts": exc.conflicts},
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_register_conflict", "message": str(exc)},
        ) from exc

def _projects_update_sync(project_id: str, body: UpdateProjectRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import (
        set_project_focus,
        update_project,
    )

    project: dict[str, Any] | None = None
    if body.focus is not None:
        project = set_project_focus(project_id, body.focus)
    if (
        body.display_name is not None
        or body.description is not None
        or body.auto_sync_recording_table is not None
        or body.predict_model is not None
        or body.predict_model_dir is not None
        or body.spectrogram_colormap is not None
    ):
        return update_project(
            project_id,
            display_name=body.display_name,
            description=body.description,
            auto_sync_recording_table=body.auto_sync_recording_table,
            predict_model=body.predict_model,
            predict_model_dir=body.predict_model_dir,
            spectrogram_colormap=body.spectrogram_colormap,
        )
    assert project is not None
    return project

@router.patch("/v1/projects/{project_id}")
async def projects_update(project_id: str, body: UpdateProjectRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import ProjectNameConflictError

    if (
        body.display_name is None
        and body.description is None
        and body.focus is None
        and body.auto_sync_recording_table is None
        and body.predict_model is None
        and body.predict_model_dir is None
        and body.spectrogram_colormap is None
    ):
        raise HTTPException(status_code=400, detail="Nothing to update")
    try:
        return await asyncio.to_thread(_projects_update_sync, project_id, body)
    except ProjectNameConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_name_conflict", "conflicts": exc.conflicts},
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.delete("/v1/projects/{project_id}")
async def projects_delete(project_id: str, delete_files: bool = False) -> dict[str, str]:
    from orcai_desktop_sidecar.project_registry import delete_project

    try:
        await asyncio.to_thread(delete_project, project_id, delete_files=delete_files)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}

