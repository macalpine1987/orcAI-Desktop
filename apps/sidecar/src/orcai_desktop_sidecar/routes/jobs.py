from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from orcai_desktop_sidecar.jobs import (
    cancel_job,
    cancel_jobs_on_shutdown,
    clear_jobs_history,
    get_job,
    job_to_dict,
    list_jobs,
)
from orcai_desktop_sidecar.schemas import (
    ClearJobsRequest,
    CreateJobRequest,
    CreateRecordingTableParams,
    InitProjectParams,
    JobsQueuePatch,
    PredictJobParams,
)

router = APIRouter()

def _jobs_list_sync(project_dir: str | None) -> dict[str, list[dict[str, Any]]]:
    # Omit log bodies on list: UI docks use SSE / ``/log``; keeps poll payloads small.
    return {
        "jobs": [
            job_to_dict(j, include_log=False) for j in list_jobs(project_dir)
        ]
    }


@router.get("/v1/jobs")
async def jobs_list(
    project_dir: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return await asyncio.to_thread(_jobs_list_sync, project_dir)


def _jobs_queue_status_sync() -> dict[str, Any]:
    from orcai_desktop_sidecar.job_queue import get_scheduler

    return get_scheduler().snapshot()


@router.get("/v1/jobs/queue")
async def jobs_queue_status() -> dict[str, Any]:
    return await asyncio.to_thread(_jobs_queue_status_sync)


def _jobs_queue_patch_sync(body: JobsQueuePatch) -> dict[str, Any]:
    from orcai_desktop_sidecar.job_queue import get_scheduler

    get_scheduler().set_max_concurrent(body.max_concurrent)
    return get_scheduler().snapshot()


@router.patch("/v1/jobs/queue")
async def jobs_queue_patch(body: JobsQueuePatch) -> dict[str, Any]:
    return await asyncio.to_thread(_jobs_queue_patch_sync, body)


def _jobs_clear_sync(body: ClearJobsRequest | None) -> dict[str, Any]:
    project_dir = body.project_dir if body else None
    return clear_jobs_history(project_dir=project_dir)


@router.post("/v1/jobs/clear")
async def jobs_clear(body: ClearJobsRequest | None = None) -> dict[str, Any]:
    """Erase job history from SQLite (cancels active jobs first)."""
    return await asyncio.to_thread(_jobs_clear_sync, body)


def _jobs_get_sync(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise LookupError(job_id)
    return job_to_dict(job)


@router.get("/v1/jobs/{job_id}")
async def jobs_get(job_id: str) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(_jobs_get_sync, job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job not found") from None


def _jobs_log_since_sync(job_id: str, since: int) -> dict[str, Any]:
    from orcai_desktop_sidecar.jobs import job_log_abs_len

    job = get_job(job_id)
    if not job:
        raise LookupError(job_id)
    base = job.log_base
    # Dropped prefix is gone; start at the retained tail.
    start = max(since, base)
    offset = start - base
    lines = list(job.log[offset:])
    return {
        "id": job.id,
        "since": since,
        "next_since": job_log_abs_len(job),
        "lines": lines,
        "progress": job.progress,
        "status": job.status.value,
        "exit_code": job.exit_code,
    }


@router.get("/v1/jobs/{job_id}/log")
async def jobs_log_since(
    job_id: str,
    since: int = Query(0, ge=0, description="Return log lines from this index"),
) -> dict[str, Any]:
    """Poll-friendly log slice that survives UI reconnect."""
    try:
        return await asyncio.to_thread(_jobs_log_since_sync, job_id, since)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job not found") from None


@router.get("/v1/jobs/{job_id}/events")
async def jobs_events(
    job_id: str,
    since: int = Query(0, ge=0, description="Replay log lines from this index first"),
) -> StreamingResponse:
    """SSE stream of log lines, progress, and status."""
    import json
    import queue

    from orcai_desktop_sidecar.job_stream import subscribe, unsubscribe

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_gen():
        from orcai_desktop_sidecar.jobs import job_log_abs_len

        # Subscribe first so live events during replay are buffered (no race gap).
        q = subscribe(job_id)
        sent_log_upto = since - 1
        last_progress: float | None = None
        last_status: str | None = None
        try:
            snapshot = get_job(job_id)
            if snapshot:
                last_progress = snapshot.progress
                last_status = snapshot.status.value
                base = snapshot.log_base
                start = max(since, base)
                offset = start - base
                for idx, line in enumerate(snapshot.log[offset:], start=start):
                    payload = {
                        "type": "log",
                        "job_id": job_id,
                        "index": idx,
                        "line": line,
                        "progress": snapshot.progress,
                        "status": snapshot.status.value,
                    }
                    yield f"event: log\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    sent_log_upto = idx
                yield (
                    "event: snapshot\ndata: "
                    + json.dumps(
                        {
                            "type": "snapshot",
                            "job_id": job_id,
                            "status": snapshot.status.value,
                            "progress": snapshot.progress,
                            "exit_code": snapshot.exit_code,
                            "next_since": job_log_abs_len(snapshot),
                        },
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )
                if snapshot.status.value in ("completed", "failed", "cancelled"):
                    return

            while True:
                try:
                    item = await asyncio.to_thread(q.get, True, 1.0)
                except queue.Empty:
                    alive = get_job(job_id)
                    if not alive:
                        break
                    abs_len = job_log_abs_len(alive)
                    for idx in range(max(sent_log_upto + 1, alive.log_base), abs_len):
                        rel = idx - alive.log_base
                        line = alive.log[rel]
                        payload = {
                            "type": "log",
                            "job_id": job_id,
                            "index": idx,
                            "line": line,
                            "progress": alive.progress,
                            "status": alive.status.value,
                        }
                        yield (
                            f"event: log\ndata: "
                            f"{json.dumps(payload, ensure_ascii=False)}\n\n"
                        )
                        sent_log_upto = idx
                    if alive.progress != last_progress:
                        last_progress = alive.progress
                        yield (
                            "event: progress\ndata: "
                            + json.dumps(
                                {
                                    "type": "progress",
                                    "job_id": job_id,
                                    "progress": alive.progress,
                                    "status": alive.status.value,
                                },
                                ensure_ascii=False,
                            )
                            + "\n\n"
                        )
                    if alive.status.value != last_status:
                        last_status = alive.status.value
                        yield (
                            "event: status\ndata: "
                            + json.dumps(
                                {
                                    "type": "status",
                                    "job_id": job_id,
                                    "status": alive.status.value,
                                    "progress": alive.progress,
                                    "exit_code": alive.exit_code,
                                    "error": alive.error,
                                },
                                ensure_ascii=False,
                            )
                            + "\n\n"
                        )
                    yield (
                        f"event: ping\ndata: "
                        f"{json.dumps({'type': 'ping', 'job_id': job_id})}\n\n"
                    )
                    if alive.status.value in ("completed", "failed", "cancelled"):
                        break
                    continue
                if item is None:
                    break
                etype = str(item.get("type") or "message")
                if etype == "log":
                    idx = item.get("index")
                    if isinstance(idx, int) and idx <= sent_log_upto:
                        continue
                    if isinstance(idx, int):
                        sent_log_upto = idx
                yield f"event: {etype}\ndata: {json.dumps(item, ensure_ascii=False)}\n\n"
                if etype == "status" and item.get("status") in (
                    "completed",
                    "failed",
                    "cancelled",
                ):
                    break
        finally:
            unsubscribe(job_id, q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/v1/jobs/cancel-active")
async def jobs_cancel_active() -> dict[str, int]:
    """Quit / Stop: drop the live queue before the sidecar process is killed."""
    # settle=True inside cancel_jobs_on_shutdown — off the event loop.
    cancelled = await asyncio.to_thread(cancel_jobs_on_shutdown)
    return {"cancelled": cancelled}


def _jobs_cancel_sync(job_id: str) -> dict[str, Any]:
    job = cancel_job(job_id, settle=False)
    if not job:
        raise LookupError(job_id)
    return job_to_dict(job)


@router.post("/v1/jobs/{job_id}/cancel")
async def jobs_cancel(job_id: str) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(_jobs_cancel_sync, job_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job not found") from None


def jobs_create(
    body: CreateJobRequest,
    *,
    retry_of: str | None = None,
) -> dict[str, Any]:
    """Sync create used by HTTP wrappers and project init/sync-table routes."""
    from orcai_desktop_sidecar.job_create_route import jobs_create as _jobs_create

    return _jobs_create(body, retry_of=retry_of)


@router.post("/v1/jobs/{job_id}/retry", status_code=201)
async def jobs_retry(job_id: str) -> dict[str, Any]:
    """Enqueue a new job with the same command/params."""

    def _retry() -> dict[str, Any]:
        original = get_job(job_id)
        if not original:
            raise LookupError(job_id)
        return jobs_create(
            CreateJobRequest(
                command=original.command,
                params=dict(original.params),
                priority=original.priority,
            ),
            retry_of=original.id,
        )

    try:
        return await asyncio.to_thread(_retry)
    except LookupError:
        raise HTTPException(status_code=404, detail="Job not found") from None


@router.post("/v1/jobs", status_code=201)
async def jobs_create_http(body: CreateJobRequest) -> dict[str, Any]:
    return await asyncio.to_thread(jobs_create, body)


@router.post("/v1/jobs/predict", status_code=201)
async def jobs_predict(body: PredictJobParams) -> dict[str, Any]:
    """Convenience endpoint matching the Predict UI form."""
    # exclude_unset: omitted fields keep orcAI engine defaults.
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return await asyncio.to_thread(
        jobs_create, CreateJobRequest(command="predict", params=params)
    )


@router.post("/v1/jobs/create-recording-table", status_code=201)
async def jobs_create_recording_table(body: CreateRecordingTableParams) -> dict[str, Any]:
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return await asyncio.to_thread(
        jobs_create,
        CreateJobRequest(command="create-recording-table", params=params),
    )


@router.post("/v1/jobs/init", status_code=201)
async def jobs_init_project(body: InitProjectParams) -> dict[str, Any]:
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return await asyncio.to_thread(
        jobs_create, CreateJobRequest(command="init", params=params)
    )
