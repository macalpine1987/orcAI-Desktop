from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Response

from orcai_desktop_sidecar.http_errors import path_http_errors
from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.runtime_state import spec_executor

router = APIRouter()

@router.get("/v1/spectrogram/meta")
async def spectrogram_meta(
    path: str,
    orcai_parameter: str | None = None,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import get_spectrogram_meta
    from orcai_desktop_sidecar.paths import resolve_user_path

    def _work() -> dict[str, Any]:
        resolved = resolve_user_path(path, expect_wav=True)
        return get_spectrogram_meta(str(resolved), orcai_parameter=orcai_parameter)

    try:
        return await asyncio.to_thread(_work)
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise path_http_errors(exc) from exc

@router.post("/v1/spectrogram/warm")
async def spectrogram_warm(
    path: str,
    channel: int = 1,
    orcai_parameter: str | None = None,
    windowed: bool = False,
) -> dict[str, Any]:
    """Build disk+RAM cache for a WAV (no tile PNG). Used to prefetch neighbors."""
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import ensure_orcai_spectrogram_cached
    from orcai_desktop_sidecar.paths import resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        resolved = resolve_user_path(path, expect_wav=True)
        return await loop.run_in_executor(
            spec_executor,
            lambda: ensure_orcai_spectrogram_cached(
                str(resolved),
                channel=channel,
                orcai_parameter=orcai_parameter,
                windowed=windowed,
            ),
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise path_http_errors(exc) from exc


@router.get("/v1/spectrogram/histogram")
async def spectrogram_histogram(
    path: str,
    t0: float = 0.0,
    t1: float | None = None,
    channel: int = 1,
    orcai_parameter: str | None = None,
    display_kind: str = "orcai",
    bins: int = 18,
    windowed: bool = False,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import spectrogram_histogram as hist
    from orcai_desktop_sidecar.paths import resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        resolved = resolve_user_path(path, expect_wav=True)
        return await loop.run_in_executor(
            spec_executor,
            lambda: hist(
                str(resolved),
                t0=t0,
                t1=t1,
                channel=channel,
                orcai_parameter=orcai_parameter,
                display_kind=display_kind,
                bins=bins,
                windowed=windowed,
            ),
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise path_http_errors(exc) from exc


@router.post("/v1/spectrograms/cache/clear")
async def spectrograms_cache_clear() -> dict[str, Any]:
    """Delete spectrogram tile cache (disk + RAM)."""
    from orcai_desktop_sidecar.maintenance import clear_spectrogram_tile_cache

    return await asyncio.to_thread(clear_spectrogram_tile_cache)

@router.get("/v1/spectrogram/tile")
async def spectrogram_tile(
    path: str,
    t0: float = 0.0,
    t1: float | None = None,
    width: int = 800,
    height: int = 256,
    channel: int = 1,
    orcai_parameter: str | None = None,
    display_kind: str = "orcai",
    colormap: str = "inferno",
    vmin: float = 0.0,
    vmax: float = 1.0,
    windowed: bool = False,
) -> Response:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import render_spectrogram_tile_png
    from orcai_desktop_sidecar.paths import resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        resolved = resolve_user_path(path, expect_wav=True)
        wav = str(resolved)
        png = await loop.run_in_executor(
            spec_executor,
            lambda: render_spectrogram_tile_png(
                wav,
                t0=t0,
                t1=t1,
                width=width,
                height=height,
                channel=channel,
                orcai_parameter=orcai_parameter,
                display_kind=display_kind,
                colormap=colormap,
                vmin=vmin,
                vmax=vmax,
                windowed=windowed,
            ),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except Exception as exc:  # noqa: BLE001 — spectrogram/media boundary; map to HTTP 500
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    cmap = (colormap or "inferno").lower().strip()
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Vary": "colormap, display_kind",
            "X-Spectrogram-Colormap": cmap,
        },
    )


@router.get("/v1/spectrogram/waveform")
async def spectrogram_waveform(
    path: str,
    t0: float = 0.0,
    t1: float | None = None,
    width: int = 800,
    height: int = 48,
    channel: int = 1,
) -> Response:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import render_waveform_png
    from orcai_desktop_sidecar.paths import resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        resolved = resolve_user_path(path, expect_wav=True)
        wav = str(resolved)
        png = await loop.run_in_executor(
            spec_executor,
            lambda: render_waveform_png(
                wav,
                t0=t0,
                t1=t1,
                width=width,
                height=height,
                channel=channel,
            ),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise path_http_errors(exc) from exc
    except Exception as exc:  # noqa: BLE001 — spectrogram/media boundary; map to HTTP 500
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(content=png, media_type="image/png")
