from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.http_errors import path_http_errors
from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.runtime_state import spec_executor
from orcai_desktop_sidecar.schemas import ExportAudacityParams

router = APIRouter()

def _labels_export_audacity_sync(body: ExportAudacityParams) -> dict[str, Any]:
    from pathlib import Path

    from orcai_desktop_sidecar.adapters.labels import (
        export_audacity_labels,
        labels_to_audacity_text,
    )
    from orcai_desktop_sidecar.paths import resolve_user_path

    wav_resolved = (
        str(resolve_user_path(body.wav_path, expect_wav=True))
        if body.wav_path
        else None
    )
    if body.output_path:
        return export_audacity_labels(
            body.label_path,
            body.output_path,
            wav_path=wav_resolved,
            channel=body.channel,
            orcai_parameter_path=body.orcai_parameter,
        )
    content = labels_to_audacity_text(
        body.label_path,
        wav_path=wav_resolved,
        channel=body.channel,
        orcai_parameter_path=body.orcai_parameter,
    )
    default_name = Path(body.label_path).stem + "_audacity.txt"
    return {"content": content, "suggested_name": default_name}


@router.post("/v1/labels/export-audacity")
async def labels_export_audacity(body: ExportAudacityParams) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            spec_executor,
            lambda: _labels_export_audacity_sync(body),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc


@router.get("/v1/labels/preview")
async def labels_preview(
    path: str,
    wav_path: str | None = None,
    channel: int = 1,
    orcai_parameter: str | None = None,
    compute_tf_bounds: bool = True,
    windowed: bool = False,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.labels import labels_preview as preview
    from orcai_desktop_sidecar.paths import resolve_user_label_path, resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        label_resolved = resolve_user_label_path(path)
        wav_resolved = (
            str(resolve_user_path(wav_path, expect_wav=True)) if wav_path else None
        )
        return await loop.run_in_executor(
            spec_executor,
            lambda: preview(
                str(label_resolved),
                wav_path=wav_resolved,
                channel=channel,
                orcai_parameter_path=orcai_parameter,
                compute_tf_bounds=compute_tf_bounds,
                windowed=windowed,
            ),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
