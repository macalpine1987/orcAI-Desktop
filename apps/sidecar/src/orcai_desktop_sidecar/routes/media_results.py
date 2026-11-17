from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.http_errors import path_http_errors
from orcai_desktop_sidecar.runtime_state import (
    results_cache,
    results_cache_lock,
    section_cache_get_or_build,
)

router = APIRouter()

def _results_summary_sync(scan_root: str, kind: str, fresh: bool) -> dict[str, Any]:
    from orcai_desktop_sidecar.adapters.results_summary import build_results_summary

    key = (scan_root, kind)
    return section_cache_get_or_build(
        results_cache,
        key,
        lambda: build_results_summary(scan_root, source=kind),  # type: ignore[arg-type]
        lock=results_cache_lock,
        fresh=fresh,
    )


@router.get("/v1/results/summary")
async def results_summary(
    project_dir: str,
    source: str = "predicted",
    fresh: bool = False,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.paths import resolve_user_dir

    kind = source.strip().lower()
    if kind not in {"predicted", "filtered", "annotations"}:
        raise HTTPException(
            status_code=400, detail="source must be predicted, filtered, or annotations"
        )
    try:
        scan_root = str(resolve_user_dir(project_dir))
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return await asyncio.to_thread(_results_summary_sync, scan_root, kind, fresh)
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
