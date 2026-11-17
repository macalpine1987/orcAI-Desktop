from __future__ import annotations

import asyncio
import threading
from typing import Any

from fastapi import APIRouter, HTTPException

from orcai_desktop_sidecar.jobs import (
    append_log,
    create_job,
    get_job,
    job_to_dict,
)
from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.routes.jobs import jobs_create
from orcai_desktop_sidecar.schemas import (
    CreateJobRequest,
    DeleteRecordingsRequest,
    ImportRecordingsRequest,
    RecordingChannelRequest,
    SyncTableRequest,
)

router = APIRouter()

@router.get("/v1/projects/{project_id}/recordings")
async def projects_list_recordings(project_id: str) -> dict[str, list[dict[str, Any]]]:
    from orcai_desktop_sidecar.project_registry import list_project_recordings

    try:
        recordings = await asyncio.to_thread(list_project_recordings, project_id)
        return {"recordings": recordings}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

def schedule_import_audio_job(job_id: str, command: str, params: dict[str, Any]) -> None:
    """Run import-audio in a registered background thread (cancelable like in-process jobs)."""
    from orcai_desktop_sidecar.job_cancel import clear as clear_cancel
    from orcai_desktop_sidecar.job_cancel import register_thread
    from orcai_desktop_sidecar.job_worker import run_job_in_worker

    def _run() -> None:
        try:
            run_job_in_worker(job_id, command, params)
        finally:
            clear_cancel(job_id)

    thread = threading.Thread(
        target=_run,
        daemon=True,
        name=f"import-audio-{job_id[:8]}",
    )
    register_thread(job_id, thread)
    thread.start()

def _projects_import_recordings_sync(
    project_id: str,
    body: ImportRecordingsRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.jobs import JobStatus, set_status
    from orcai_desktop_sidecar.project_registry import get_project

    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        job = create_job(
            "import-audio",
            {"project_id": project_id, "paths": body.paths},
        )
        append_log(job.id, f"Queued import of {len(body.paths)} file(s)")
        set_status(job.id, JobStatus.RUNNING)
        schedule_import_audio_job(job.id, job.command, job.params)
        live = get_job(job.id) or job
        return {"job": job_to_dict(live), "job_id": job.id, "async": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/v1/projects/{project_id}/recordings/import", status_code=202)
async def projects_import_recordings(
    project_id: str,
    body: ImportRecordingsRequest,
) -> dict[str, Any]:
    """Queue background import: WAV files are copied into recordings/."""
    return await asyncio.to_thread(_projects_import_recordings_sync, project_id, body)

def projects_delete_recordings_impl(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import delete_recordings

    if not body.delete_all and not body.filenames:
        raise HTTPException(
            status_code=400,
            detail="Provide filenames or set delete_all=true",
        )
    try:
        return delete_recordings(
            project_id,
            filenames=body.filenames or None,
            delete_all=body.delete_all,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/v1/projects/{project_id}/recordings/delete")
async def projects_delete_recordings_post(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    """Preferred delete endpoint (reliable JSON body; DELETE+body is often dropped)."""
    return await asyncio.to_thread(
        projects_delete_recordings_impl, project_id, body
    )

@router.delete("/v1/projects/{project_id}/recordings")
async def projects_delete_recordings(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        projects_delete_recordings_impl, project_id, body
    )

def _projects_init_sync(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import init_job_params

    try:
        params = init_job_params(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return jobs_create(CreateJobRequest(command="init", params=params))


@router.post("/v1/projects/{project_id}/init", status_code=201)
async def projects_init(project_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_projects_init_sync, project_id)

@router.post("/v1/projects/{project_id}/recordings/sync-table", status_code=201)
async def projects_sync_table(project_id: str, body: SyncTableRequest | None = None) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import sync_table_job_params

    req = body or SyncTableRequest()
    try:
        params = await asyncio.to_thread(
            sync_table_job_params,
            project_id,
            overwrite=req.overwrite,
            update_table=req.update_table,
            default_channel=req.default_channel,
            remove_duplicate_filenames=req.remove_duplicate_filenames,
            exclude_patterns=req.exclude_patterns,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return jobs_create(
        CreateJobRequest(command="create-recording-table", params=params)
    )

@router.get("/v1/projects/{project_id}/recording-table")
async def projects_recording_table(project_id: str) -> dict[str, Any]:
    """Full recording_table.csv + computed columns (вкладка «Записи»)."""
    from orcai_desktop_sidecar.project_studio import read_recording_table

    try:
        return await asyncio.to_thread(read_recording_table, project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.patch("/v1/projects/{project_id}/recording-table/rows/{recording}")
async def projects_recording_table_channel(
    project_id: str,
    recording: str,
    body: RecordingChannelRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import set_recording_channel

    try:
        return await asyncio.to_thread(
            set_recording_channel, project_id, recording, body.channel
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

def _recording_table_preview_sync(path: str, limit: int) -> dict[str, Any]:
    import pandas as pd

    from orcai_desktop_sidecar.paths import resolve_user_csv_path

    csv_path = resolve_user_csv_path(path)
    df = pd.read_csv(csv_path, index_col=0)
    preview = df.head(limit).reset_index().to_dict(orient="records")
    return {
        "path": str(csv_path.resolve()),
        "row_count": len(df),
        "columns": list(df.columns),
        "preview": preview,
    }

@router.get("/v1/recording-tables/preview")
async def recording_table_preview(path: str, limit: int = 50) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    try:
        return await asyncio.to_thread(_recording_table_preview_sync, path, limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

