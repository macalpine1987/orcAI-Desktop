from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from orcai_desktop_sidecar.http_errors import path_http_errors
from orcai_desktop_sidecar.runtime_state import spec_executor

router = APIRouter()

@router.get("/v1/audio/playback")
async def audio_playback(path: str, channel: int = 1) -> FileResponse:
    """Mono WAV for HTML audio (cached); respects spectrogram channel."""
    from orcai_desktop_sidecar.adapters.audio import ensure_mono_playback_wav
    from orcai_desktop_sidecar.paths import resolve_user_path

    loop = asyncio.get_event_loop()
    try:
        resolved = resolve_user_path(path, expect_wav=True)
        wav = await loop.run_in_executor(
            spec_executor,
            lambda: ensure_mono_playback_wav(resolved, channel),
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise path_http_errors(exc) from exc
    except Exception as exc:  # noqa: BLE001 — audio boundary; map to HTTP 500
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        wav,
        media_type="audio/wav",
        filename=wav.name,
        headers={"Cache-Control": "private, max-age=3600"},
    )


def _audio_segment_encode(
    path: str,
    channel: int,
    t0: float,
    t1: float,
):
    from orcai_desktop_sidecar.adapters.audio import (
        AUDIO_CACHE_DIR,
        audio_cache_key,
        write_wav_segment,
    )
    from orcai_desktop_sidecar.paths import resolve_user_path

    src = resolve_user_path(path, expect_wav=True)
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ch = max(1, int(channel))
    key = audio_cache_key(src, ch)
    out = AUDIO_CACHE_DIR / f"{key}_seg_{t0:.3f}_{t1:.3f}.wav"
    if not out.is_file():
        write_wav_segment(src, ch, t0, t1, out)
    return out


@router.get("/v1/audio/segment")
async def audio_segment(
    path: str,
    channel: int = 1,
    t0: float = 0.0,
    t1: float = 1.0,
) -> FileResponse:
    """Short mono WAV clip for segment preview."""

    loop = asyncio.get_event_loop()
    try:
        out = await loop.run_in_executor(
            spec_executor,
            lambda: _audio_segment_encode(path, channel, t0, t1),
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise path_http_errors(exc) from exc
    except Exception as exc:  # noqa: BLE001 — audio boundary; map to HTTP 500
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        out,
        media_type="audio/wav",
        filename=out.name,
        headers={"Cache-Control": "private, max-age=3600"},
    )
