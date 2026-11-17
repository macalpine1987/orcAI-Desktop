from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.http_errors import path_http_errors
from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.schemas import (
    FilterPreviewRequest,
    FsWriteTextRequest,
)

router = APIRouter()

# Predicted label tables / JSON limits stay well under this; refuse giant dumps.
_FS_TEXT_MAX_BYTES = 16 * 1024 * 1024  # 16 MiB (was 32; caps peak RAM)


def _fs_exists_sync(path: str) -> dict[str, object]:
    from orcai_desktop_sidecar.paths import resolve_user_existing_or_probe

    resolved = resolve_user_existing_or_probe(path)
    return {
        "exists": resolved.exists(),
        "is_file": resolved.is_file(),
        "is_dir": resolved.is_dir(),
        "path": str(resolved),
    }


@router.get("/v1/fs/exists")
async def fs_exists(path: str) -> dict[str, object]:
    """Check whether a local path exists (file or directory)."""
    try:
        return await asyncio.to_thread(_fs_exists_sync, path)
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _fs_orcai_parameter_sync(project_dir: str) -> dict[str, object]:
    from orcai_desktop_sidecar.model_studio import project_parameter_path
    from orcai_desktop_sidecar.paths import resolve_user_existing_or_probe

    resolved = resolve_user_existing_or_probe(project_dir)
    if not resolved.is_dir():
        return {"path": None, "exists": False, "project_dir": str(resolved)}
    found = project_parameter_path(resolved)
    return {
        "path": str(found) if found else None,
        "exists": found is not None,
        "project_dir": str(resolved),
    }


@router.get("/v1/fs/orcai-parameter")
async def fs_orcai_parameter(project_dir: str) -> dict[str, object]:
    """Resolve ``*_orcai_parameter.json`` for a project directory (folder name → glob)."""
    try:
        return await asyncio.to_thread(_fs_orcai_parameter_sync, project_dir)
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _fs_read_text_sync(path: str) -> dict[str, str]:
    from orcai_desktop_sidecar.paths import resolve_user_path

    resolved = resolve_user_path(path)
    size = resolved.stat().st_size
    if size > _FS_TEXT_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large to read via API ({size} bytes; "
                f"max {_FS_TEXT_MAX_BYTES})"
            ),
        )
    return {"path": str(resolved), "content": resolved.read_text(encoding="utf-8")}


@router.get("/v1/fs/read-text")
async def fs_read_text(path: str) -> dict[str, str]:
    """Read a UTF-8 text file (JSON limits, predicted labels)."""
    try:
        return await asyncio.to_thread(_fs_read_text_sync, path)
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc


def _fs_write_text_sync(path: str, content: str) -> dict[str, str]:
    from orcai_desktop_sidecar.paths import resolve_user_output_path

    encoded_len = len(content.encode("utf-8"))
    if encoded_len > _FS_TEXT_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Payload too large ({encoded_len} bytes; "
                f"max {_FS_TEXT_MAX_BYTES})"
            ),
        )
    resolved = resolve_user_output_path(path)
    if not resolved.parent.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Parent directory does not exist: {resolved.parent}",
        )
    resolved.write_text(content, encoding="utf-8")
    return {"path": str(resolved)}


@router.put("/v1/fs/write-text")
async def fs_write_text(body: FsWriteTextRequest) -> dict[str, str]:
    """Write UTF-8 text (call_duration_limits JSON). Parent dir must exist."""
    try:
        return await asyncio.to_thread(_fs_write_text_sync, body.path, body.content)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc


@router.get("/v1/filter-predictions/defaults")
async def filter_predictions_defaults() -> dict[str, object]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.filter_preview import (
        default_call_duration_limits,
    )

    limits = await asyncio.to_thread(default_call_duration_limits)
    return {"limits": limits}


@router.post("/v1/filter-predictions/preview")
async def filter_predictions_preview(body: FilterPreviewRequest) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    if not body.predicted_labels:
        raise HTTPException(status_code=400, detail="predicted_labels is required")
    from orcai_desktop_sidecar.adapters.filter_preview import (
        preview_filter_predictions,
    )
    from orcai_desktop_sidecar.paths import resolve_user_existing_or_probe

    paths: list[str] = []
    try:
        for raw in body.predicted_labels:
            paths.append(str(resolve_user_existing_or_probe(raw)))
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        return await asyncio.to_thread(
            lambda: preview_filter_predictions(
                paths,
                body.call_duration_limits,
                label_suffix=body.label_suffix,
            ),
        )
    except Exception as exc:  # noqa: BLE001 — surface filter failures as 400
        raise HTTPException(status_code=400, detail=str(exc)) from exc
