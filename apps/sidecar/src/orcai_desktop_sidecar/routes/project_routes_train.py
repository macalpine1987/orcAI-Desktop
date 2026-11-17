from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.schemas import SnippetCalculatorRequest

router = APIRouter()

@router.get("/v1/projects/{project_id}/pipeline")
async def projects_pipeline(project_id: str, fresh: bool = False) -> dict[str, Any]:
    from orcai_desktop_sidecar.train_pipeline import get_project_pipeline

    try:
        return await asyncio.to_thread(
            lambda: get_project_pipeline(project_id, fresh=fresh)
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/v1/projects/{project_id}/snippet-calculator")
async def projects_snippet_calculator(
    project_id: str,
    body: SnippetCalculatorRequest,
) -> dict[str, Any]:
    """Train wizard: expected snippets per split and suggested n_batch_*."""
    from orcai_desktop_sidecar.snippet_calculator import calculate_snippets

    try:
        return await asyncio.to_thread(
            calculate_snippets, project_id, body.model_dump()
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get("/v1/projects/{project_id}/train-monitor")
async def projects_train_monitor(project_id: str) -> dict[str, Any]:
    """Live / last train metrics for monitor (m14)."""
    from orcai_desktop_sidecar.train_monitor import get_project_train_monitor

    try:
        return await asyncio.to_thread(get_project_train_monitor, project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

