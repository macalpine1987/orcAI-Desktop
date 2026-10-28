"""Local HTTP API for orcAI Desktop."""

from __future__ import annotations

import asyncio
import contextlib
import multiprocessing
import os
import platform
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

_spec_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="orcai-spec")
# Serialize in-process jobs that rewrite recording_table.csv / project files.
_inprocess_job_lock = threading.Lock()

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from orcai_desktop_sidecar.jobs import (
    append_log,
    cancel_job,
    cancel_jobs_on_shutdown,
    clear_jobs_history,
    create_job,
    get_job,
    job_to_dict,
    list_jobs,
)
from orcai_desktop_sidecar.runner import (
    IMPLEMENTED_COMMANDS,
    orcai_available,
)

app = FastAPI(title="orcAI Desktop Sidecar", version="0.1.5")


@app.on_event("startup")
def _startup() -> None:
    from orcai_desktop_sidecar.jobs import bootstrap_jobs, cancel_jobs_on_shutdown
    from orcai_desktop_sidecar.store import _APP_DIR

    bootstrap_jobs()
    # A new process has no workers. Drop leftover pending/running rows even
    # when the previous exit did not leave a crash marker.
    with contextlib.suppress(Exception):
        cancel_jobs_on_shutdown()
    marker = _APP_DIR / "sidecar-crashed"
    if marker.is_file():
        marker.unlink(missing_ok=True)


@app.on_event("shutdown")
def _shutdown() -> None:
    # SIGTERM (port cleanup) never reaches the host HTTP call below.
    with contextlib.suppress(Exception):
        cancel_jobs_on_shutdown()

_origins = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ALL_COMMANDS = [
    "init",
    "create-recording-table",
    "predict",
    "filter-predictions",
    "create-spectrograms",
    "create-label-arrays",
    "create-snippet-table",
    "create-tvt-snippet-tables",
    "create-tvt-data",
    "hpsearch",
    "train",
    "test",
]


class CreateJobRequest(BaseModel):
    command: str = Field(..., description="orcAI CLI command name")
    params: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(0, description="Higher runs first; default 0")


class InitProjectParams(BaseModel):
    project_dir: str
    project_name: str
    verbosity: int = 2


class CreateRecordingTableParams(BaseModel):
    base_dir_recording: str
    output_path: str | None = None
    base_dir_annotation: str | None = None
    default_channel: int = 1
    remove_duplicate_filenames: bool = False
    overwrite: bool = False
    verbosity: int = 2


class ExportAudacityParams(BaseModel):
    label_path: str
    wav_path: str | None = None
    output_path: str | None = None
    channel: int = 1
    orcai_parameter: str | None = None


class PredictJobParams(BaseModel):
    recording_path: str
    channel: int = 1
    threshold: float = 0.5
    model: str = "orcai-isl-v1"
    model_dir: str | None = None
    output_path: str = "default"
    overwrite: bool = False
    save_probabilities: bool = False
    base_dir_recording: str | None = None
    call_duration_limits: str | None = None
    label_suffix: str = "*"
    verbosity: int = 2
    project_dir: str | None = None
    # Desktop-only: subset of recording_table.csv rows (stems); omitted from orcAI CLI.
    recording_names: list[str] | None = None


class EngineStartRequest(BaseModel):
    compute_device: str = Field(default="cpu", description="cpu or gpu")


class CreateProjectRequest(BaseModel):
    parent_dir: str
    display_name: str
    description: str = ""
    orcai_name: str | None = None
    import_paths: list[str] = Field(default_factory=list)
    project_kind: str = "recognition"
    focus: str | None = Field(
        default=None,
        description="Soft focus (recognition | training | full); Desktop SQLite only",
    )


class RegisterProjectRequest(BaseModel):
    path: str
    display_name: str | None = None


class UpdateProjectRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None
    focus: str | None = None
    auto_sync_recording_table: bool | None = None
    predict_model: str | None = None
    predict_model_dir: str | None = None
    spectrogram_colormap: str | None = None


class RecordingChannelRequest(BaseModel):
    channel: int = Field(..., ge=1, le=64)


class ParameterTextRequest(BaseModel):
    text: str


class ImportRecordingsRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1)


class DeleteRecordingsRequest(BaseModel):
    filenames: list[str] = Field(default_factory=list)
    delete_all: bool = False


class SyncTableRequest(BaseModel):
    overwrite: bool = False
    update_table: bool = False


@app.get("/v1/fs/exists")
def fs_exists(path: str) -> dict[str, object]:
    """Check whether a local path exists (file or directory)."""
    from orcai_desktop_sidecar.paths import resolve_user_existing_or_probe

    try:
        resolved = resolve_user_existing_or_probe(path)
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "exists": resolved.exists(),
        "is_file": resolved.is_file(),
        "is_dir": resolved.is_dir(),
        "path": str(resolved),
    }


@app.get("/v1/fs/orcai-parameter")
def fs_orcai_parameter(project_dir: str) -> dict[str, object]:
    """Resolve ``*_orcai_parameter.json`` for a project directory (folder name → glob)."""
    from orcai_desktop_sidecar.model_studio import project_parameter_path
    from orcai_desktop_sidecar.paths import resolve_user_existing_or_probe

    try:
        resolved = resolve_user_existing_or_probe(project_dir)
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not resolved.is_dir():
        return {"path": None, "exists": False, "project_dir": str(resolved)}
    found = project_parameter_path(resolved)
    return {
        "path": str(found) if found else None,
        "exists": found is not None,
        "project_dir": str(resolved),
    }


@app.get("/v1/fs/read-text")
def fs_read_text(path: str) -> dict[str, str]:
    """Read a UTF-8 text file (JSON limits, predicted labels)."""
    from orcai_desktop_sidecar.paths import resolve_user_path

    try:
        resolved = resolve_user_path(path)
        return {"path": str(resolved), "content": resolved.read_text(encoding="utf-8")}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc


class FsWriteTextRequest(BaseModel):
    path: str
    content: str


@app.put("/v1/fs/write-text")
def fs_write_text(body: FsWriteTextRequest) -> dict[str, str]:
    """Write UTF-8 text (call_duration_limits JSON). Parent dir must exist."""
    from orcai_desktop_sidecar.paths import resolve_user_output_path

    try:
        resolved = resolve_user_output_path(body.path)
        if not resolved.parent.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"Parent directory does not exist: {resolved.parent}",
            )
        resolved.write_text(body.content, encoding="utf-8")
        return {"path": str(resolved)}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc


@app.get("/v1/filter-predictions/defaults")
def filter_predictions_defaults() -> dict[str, object]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.filter_preview import (
        default_call_duration_limits,
    )

    return {"limits": default_call_duration_limits()}


class FilterPreviewRequest(BaseModel):
    predicted_labels: list[str] = Field(default_factory=list)
    call_duration_limits: dict[str, Any] = Field(default_factory=dict)
    label_suffix: str = "*"


@app.post("/v1/filter-predictions/preview")
def filter_predictions_preview(body: FilterPreviewRequest) -> dict[str, Any]:
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
        raise _path_http_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        return preview_filter_predictions(
            paths,
            body.call_duration_limits,
            label_suffix=body.label_suffix,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, object]:
    from orcai_desktop_sidecar.engine import engine_runtime_info

    payload: dict[str, object] = {
        "status": "ok",
        "orcai": "yes" if orcai_available() else "no",
        **engine_runtime_info(),
    }
    return payload


@app.post("/v1/engine/start")
def engine_start(body: EngineStartRequest) -> dict[str, str]:
    if not orcai_available():
        raise HTTPException(
            status_code=503,
            detail="orcai is not installed in the sidecar environment",
        )
    from orcai_desktop_sidecar.engine import start_engine_warmup

    device = body.compute_device.strip().lower()
    if device not in ("cpu", "gpu"):
        raise HTTPException(status_code=400, detail="compute_device must be cpu or gpu")
    start_engine_warmup(device)
    return {"status": "warming", "compute_device": device}


@app.post("/v1/engine/stop")
def engine_stop() -> dict[str, str]:
    from orcai_desktop_sidecar.engine import stop_engine

    stop_engine()
    return {"status": "idle"}


@app.get("/v1/capabilities")
def capabilities() -> dict[str, object]:
    from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

    orcai_ver = None
    if orcai_available():
        from importlib.metadata import version

        orcai_ver = version("orcai")

    accel = get_cached_accelerator_summary()
    plat = platform.system().lower()
    builtin_models: list[dict[str, str]] = []
    if orcai_available():
        from orcai_desktop_sidecar.adapters.models import list_builtin_models

        builtin_models = list_builtin_models()
    return {
        "platform": plat,
        "python": sys.version.split()[0],
        "multi_gpu_hpsearch": plat == "linux",
        "orcai_installed": orcai_available(),
        "orcai_version": orcai_ver,
        "builtin_models": builtin_models,
        "implemented_commands": sorted(IMPLEMENTED_COMMANDS),
        "supported_commands": _ALL_COMMANDS,
        "gpu_available": accel.get("gpu_available", False),
        "gpu_backend": accel.get("gpu_backend"),
        "gpu_devices": accel.get("gpu_devices", []),
        "metal_plugin_installed": accel.get("metal_plugin_installed", False),
        "tensorflow_version": accel.get("tensorflow_version"),
        "accelerator_hint": accel.get("accelerator_hint"),
        "active_compute_device": accel.get("active_compute_device"),
    }


@app.get("/v1/models")
def models_list(project_dir: str | None = None) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import list_models_studio

    return {"models": list_models_studio(project_dir)}


@app.get("/v1/models/detail")
def models_detail(
    model_id: str,
    project_dir: str | None = None,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import get_model_detail

    try:
        return get_model_detail(model_id, project_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class ModelsCompatibilityBody(BaseModel):
    model_id: str
    project_dir: str


@app.post("/v1/models/compatibility")
def models_compatibility(body: ModelsCompatibilityBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import (
        compare_compatibility,
        resolve_model_dir,
    )

    model_dir = resolve_model_dir(body.model_id, body.project_dir)
    if model_dir is None:
        raise HTTPException(status_code=404, detail=f"Model not found: {body.model_id}")
    return compare_compatibility(model_dir, Path(body.project_dir))


class ModelsImportBody(BaseModel):
    source_dir: str
    project_dir: str
    dest_name: str | None = None


@app.post("/v1/models/import")
def models_import(body: ModelsImportBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import import_model_directory

    try:
        return import_model_directory(
            body.source_dir,
            body.project_dir,
            dest_name=body.dest_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class ModelsExportBody(BaseModel):
    model_id: str
    dest_parent: str
    project_dir: str | None = None
    dest_name: str | None = None


@app.post("/v1/models/export")
def models_export(body: ModelsExportBody) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.model_studio import export_model_directory

    try:
        return export_model_directory(
            body.model_id,
            body.dest_parent,
            project_dir=body.project_dir,
            dest_name=body.dest_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/jobs")
def jobs_list(project_dir: str | None = None) -> dict[str, list[dict[str, Any]]]:
    return {"jobs": [job_to_dict(j) for j in list_jobs(project_dir)]}


@app.get("/v1/jobs/queue")
def jobs_queue_status() -> dict[str, Any]:
    from orcai_desktop_sidecar.job_queue import get_scheduler

    return get_scheduler().snapshot()


class JobsQueuePatch(BaseModel):
    max_concurrent: int = Field(1, ge=1, le=8)


@app.patch("/v1/jobs/queue")
def jobs_queue_patch(body: JobsQueuePatch) -> dict[str, Any]:
    from orcai_desktop_sidecar.job_queue import get_scheduler

    get_scheduler().set_max_concurrent(body.max_concurrent)
    return get_scheduler().snapshot()


class ClearJobsRequest(BaseModel):
    project_dir: str | None = None


@app.post("/v1/jobs/clear")
def jobs_clear(body: ClearJobsRequest | None = None) -> dict[str, Any]:
    """Erase job history from SQLite (cancels active jobs first)."""
    project_dir = body.project_dir if body else None
    return clear_jobs_history(project_dir=project_dir)


@app.get("/v1/jobs/{job_id}")
def jobs_get(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_to_dict(job)


@app.get("/v1/jobs/{job_id}/log")
def jobs_log_since(
    job_id: str,
    since: int = Query(0, ge=0, description="Return log lines from this index"),
) -> dict[str, Any]:
    """Poll-friendly log slice that survives UI reconnect."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    lines = list(job.log[since:])
    return {
        "id": job.id,
        "since": since,
        "next_since": since + len(lines),
        "lines": lines,
        "progress": job.progress,
        "status": job.status.value,
        "exit_code": job.exit_code,
    }


@app.get("/v1/jobs/{job_id}/events")
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
                for idx, line in enumerate(snapshot.log[since:], start=since):
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
                            "next_since": len(snapshot.log),
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
                    for idx in range(sent_log_upto + 1, len(alive.log)):
                        line = alive.log[idx]
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


@app.post("/v1/jobs/cancel-active")
def jobs_cancel_active() -> dict[str, int]:
    """Quit / Stop: drop the live queue before the sidecar process is killed."""
    return {"cancelled": cancel_jobs_on_shutdown()}


@app.post("/v1/jobs/{job_id}/cancel")
def jobs_cancel(job_id: str) -> dict[str, Any]:
    job = cancel_job(job_id, settle=False)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_to_dict(job)


@app.post("/v1/jobs/{job_id}/retry", status_code=201)
def jobs_retry(job_id: str) -> dict[str, Any]:
    """Enqueue a new job with the same command/params."""
    original = get_job(job_id)
    if not original:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_create(
        CreateJobRequest(
            command=original.command,
            params=dict(original.params),
            priority=original.priority,
        ),
        retry_of=original.id,
    )


@app.post("/v1/jobs", status_code=201)
def jobs_create(
    body: CreateJobRequest,
    *,
    retry_of: str | None = None,
) -> dict[str, Any]:
    if not orcai_available() and body.command != "import-audio":
        raise HTTPException(
            status_code=503,
            detail="orcai is not installed in the sidecar environment",
        )

    from orcai_desktop_sidecar.train_pipeline import (
        STEPS_NEEDING_ANNOTATION_TXT,
        lacks_paired_annotation_txt,
    )

    project_dir = body.params.get("project_dir") if isinstance(body.params, dict) else None
    if (
        body.command in STEPS_NEEDING_ANNOTATION_TXT
        and isinstance(project_dir, str)
        and project_dir.strip()
        and lacks_paired_annotation_txt(project_dir)
    ):
        raise HTTPException(status_code=409, detail="no_annotations")

    from orcai_desktop_sidecar.job_queue import get_scheduler

    job = create_job(
        body.command,
        body.params,
        priority=body.priority,
        retry_of=retry_of,
    )
    append_log(job.id, f"Queued: {body.command}")
    if job.command_line:
        append_log(job.id, f"Command: {job.command_line}")

    # Short orcAI helper commands run in-process (same venv as the engine).
    # macOS spawn subprocesses often miss the bundled venv and leave jobs stuck at pending.
    _INPROCESS_COMMANDS = frozenset({"init", "create-recording-table", "import-audio"})
    if os.environ.get("ORCAI_FORCE_INPROCESS_JOBS") == "1":
        _INPROCESS_COMMANDS = frozenset(_ALL_COMMANDS) | frozenset({"import-audio"})

    def _finalize_orphaned_job(job_id: str, exitcode: int | None = None) -> None:
        from orcai_desktop_sidecar.job_cancel import is_cancelled
        from orcai_desktop_sidecar.job_queue import get_scheduler as _sched
        from orcai_desktop_sidecar.jobs import JobStatus, get_job, set_status

        _TERMINAL = (
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        )

        try:
            refreshed = get_job(job_id)
            if not refreshed:
                return
            if is_cancelled(job_id) or refreshed.status == JobStatus.CANCELLED:
                if refreshed.status != JobStatus.CANCELLED:
                    set_status(
                        job_id,
                        JobStatus.CANCELLED,
                        error="Cancelled by user",
                        exit_code=130,
                    )
                return
            if refreshed.status in _TERMINAL:
                return
            # Settle: in-process worker may still be persisting COMPLETED.
            for _ in range(20):
                time.sleep(0.05)
                refreshed = get_job(job_id)
                if not refreshed or refreshed.status in _TERMINAL:
                    return
            # Clean in-process exit without a terminal write — do not invent a failure.
            if exitcode == 0:
                set_status(job_id, JobStatus.COMPLETED, exit_code=0)
                append_log(job_id, "Worker finished (status recovered).")
                return
            detail = "Job worker exited before updating status"
            if exitcode is not None:
                detail = f"{detail} (exit code {exitcode})"
            set_status(
                job_id,
                JobStatus.FAILED,
                error=detail,
                exit_code=exitcode if exitcode is not None else 1,
            )
            append_log(job_id, detail)
        finally:
            with contextlib.suppress(Exception):
                from orcai_desktop_sidecar.jobs import cancel_plan_after_failure

                cancel_plan_after_failure(job_id)
            _sched().notify_finished(job_id)

    def _run_inprocess(job_id: str, command: str, params: dict[str, Any]) -> None:
        from orcai_desktop_sidecar.job_cancel import clear_worker, register_thread
        from orcai_desktop_sidecar.job_worker import run_job_in_worker
        from orcai_desktop_sidecar.sleep_prevent import (
            KEEP_AWAKE_COMMANDS,
            hold_keep_awake,
            release_keep_awake,
        )

        keep = command in KEEP_AWAKE_COMMANDS
        if keep:
            with contextlib.suppress(Exception):
                hold_keep_awake(job_id)

        def _target() -> None:
            try:
                with _inprocess_job_lock:
                    run_job_in_worker(job_id, command, params)
                _finalize_orphaned_job(job_id, exitcode=0)
            finally:
                clear_worker(job_id)
                if keep:
                    with contextlib.suppress(Exception):
                        release_keep_awake(job_id)

        thread = threading.Thread(
            target=_target,
            daemon=True,
            name=f"job-{job_id[:8]}",
        )
        register_thread(job_id, thread)
        thread.start()

    def _watch_subprocess(proc: multiprocessing.Process, job_id: str) -> None:
        from orcai_desktop_sidecar.job_cancel import clear_worker

        try:
            proc.join()
            clear_worker(job_id)
            _finalize_orphaned_job(job_id, exitcode=proc.exitcode)
        finally:
            with contextlib.suppress(Exception):
                from orcai_desktop_sidecar.sleep_prevent import release_keep_awake

                release_keep_awake(job_id)

    def _start_worker(job_id: str, command: str, params: dict[str, Any]) -> None:
        from orcai_desktop_sidecar.job_cancel import (
            clear_worker,
            is_cancelled,
            register_worker,
        )
        from orcai_desktop_sidecar.job_queue import get_scheduler as _sched
        from orcai_desktop_sidecar.job_worker import run_job_in_worker
        from orcai_desktop_sidecar.jobs import JobStatus, get_job, set_status

        current = get_job(job_id)
        if current and current.status == JobStatus.CANCELLED:
            _sched().notify_finished(job_id)
            return
        if is_cancelled(job_id):
            _sched().notify_finished(job_id)
            return

        if command in _INPROCESS_COMMANDS:
            _run_inprocess(job_id, command, params)
            return

        # Pin device into environ before spawn so the child inherits CPU/GPU
        # (child's engine module is fresh and would not see "ready" state).
        from orcai_desktop_sidecar.compute_device import apply_compute_device_env
        from orcai_desktop_sidecar.engine import configured_compute_device_for_jobs

        apply_compute_device_env(configured_compute_device_for_jobs())

        ctx = multiprocessing.get_context("spawn")
        proc = ctx.Process(
            target=run_job_in_worker,
            args=(job_id, command, params),
            daemon=True,
            name=f"orcai-job-{job_id[:8]}",
        )
        register_worker(job_id, proc)
        try:
            proc.start()
        except Exception as exc:  # noqa: BLE001 — worker spawn; error logged + set on job
            set_status(
                job_id,
                JobStatus.FAILED,
                error=f"Could not start worker: {exc}",
                exit_code=1,
            )
            append_log(job_id, f"Could not start worker: {exc}")
            clear_worker(job_id)
            _sched().notify_finished(job_id)
            return
        # Mark running in the parent *before* the worker finishes TF setup.
        # Otherwise short prep steps (snippet/TVT tables) stay pending during
        # import, then complete so fast that UI never shows «Выполняется».
        if not is_cancelled(job_id):
            set_status(job_id, JobStatus.RUNNING)
        # Prevent idle sleep for long train/prep jobs (parent holds until job ends).
        with contextlib.suppress(Exception):
            from orcai_desktop_sidecar.sleep_prevent import (
                KEEP_AWAKE_COMMANDS,
                hold_keep_awake,
            )

            if command in KEEP_AWAKE_COMMANDS:
                hold_keep_awake(job_id)
        threading.Thread(
            target=_watch_subprocess,
            args=(proc, job_id),
            daemon=True,
            name=f"watch-{job_id[:8]}",
        ).start()

    get_scheduler(max_concurrent=1).submit(
        job.id,
        body.command,
        body.params,
        _start_worker,
        priority=body.priority,
        created_at=job.created_at,
    )
    return job_to_dict(job)


@app.post("/v1/jobs/predict", status_code=201)
def jobs_predict(body: PredictJobParams) -> dict[str, Any]:
    """Convenience endpoint matching the Predict UI form."""
    # exclude_unset: omitted fields keep orcAI engine defaults.
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return jobs_create(CreateJobRequest(command="predict", params=params))


@app.post("/v1/jobs/create-recording-table", status_code=201)
def jobs_create_recording_table(body: CreateRecordingTableParams) -> dict[str, Any]:
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return jobs_create(
        CreateJobRequest(command="create-recording-table", params=params)
    )


@app.post("/v1/jobs/init", status_code=201)
def jobs_init_project(body: InitProjectParams) -> dict[str, Any]:
    params = body.model_dump(exclude_unset=True, exclude_none=True)
    return jobs_create(CreateJobRequest(command="init", params=params))


@app.get("/v1/projects")
def projects_list() -> dict[str, list[dict[str, Any]]]:
    from orcai_desktop_sidecar.project_registry import list_projects

    return {"projects": list_projects()}


@app.get("/v1/projects/check-name")
def projects_check_name(
    parent_dir: str,
    display_name: str,
    orcai_name: str | None = None,
    exclude_id: str | None = None,
    display_name_only: bool = False,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import check_project_name_available

    try:
        return check_project_name_available(
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


@app.get("/v1/projects/{project_id}")
def projects_get(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import get_project

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.get("/v1/projects/{project_id}/summary")
def projects_summary(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import compute_project_summary

    try:
        return compute_project_summary(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/v1/projects", status_code=201)
def projects_create(body: CreateProjectRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import (
        ProjectNameConflictError,
        create_project,
    )

    try:
        return create_project(
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


@app.post("/v1/projects/register", status_code=201)
def projects_register(body: RegisterProjectRequest) -> dict[str, Any]:
    import sqlite3

    from orcai_desktop_sidecar.project_registry import (
        ProjectNameConflictError,
        register_existing_project,
    )

    try:
        return register_existing_project(body.path, display_name=body.display_name)
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
        # Last-resort race (P2-15) — never leak as 500.
        raise HTTPException(
            status_code=409,
            detail={"code": "project_register_conflict", "message": str(exc)},
        ) from exc


@app.patch("/v1/projects/{project_id}")
def projects_update(project_id: str, body: UpdateProjectRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import (
        ProjectNameConflictError,
        set_project_focus,
        update_project,
    )

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
    except ProjectNameConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_name_conflict", "conflicts": exc.conflicts},
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/v1/projects/{project_id}")
def projects_delete(project_id: str, delete_files: bool = False) -> dict[str, str]:
    from orcai_desktop_sidecar.project_registry import delete_project

    try:
        delete_project(project_id, delete_files=delete_files)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}


@app.get("/v1/projects/{project_id}/recordings")
def projects_list_recordings(project_id: str) -> dict[str, list[dict[str, Any]]]:
    from orcai_desktop_sidecar.project_registry import list_project_recordings

    try:
        return {"recordings": list_project_recordings(project_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _schedule_import_audio_job(job_id: str, command: str, params: dict[str, Any]) -> None:
    """Run import-audio in a background thread (soundfile only, no subprocess spawn)."""

    def _run() -> None:
        from orcai_desktop_sidecar.job_worker import run_job_in_worker

        run_job_in_worker(job_id, command, params)

    threading.Thread(
        target=_run,
        daemon=True,
        name=f"import-audio-{job_id[:8]}",
    ).start()


@app.post("/v1/projects/{project_id}/recordings/import", status_code=202)
def projects_import_recordings(
    project_id: str,
    body: ImportRecordingsRequest,
) -> dict[str, Any]:
    """Queue background import: WAV files are copied into recordings/."""
    from orcai_desktop_sidecar.project_registry import get_project

    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        job = create_job(
            "import-audio",
            {"project_id": project_id, "paths": body.paths},
        )
        append_log(job.id, f"Queued import of {len(body.paths)} file(s)")
        # Mark running before the UI upserts so SSE attaches immediately (pending→running race).
        from orcai_desktop_sidecar.jobs import JobStatus, get_job, set_status

        set_status(job.id, JobStatus.RUNNING)
        _schedule_import_audio_job(job.id, job.command, job.params)
        live = get_job(job.id) or job
        return {"job": job_to_dict(live), "job_id": job.id, "async": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _projects_delete_recordings_impl(
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


@app.post("/v1/projects/{project_id}/recordings/delete")
def projects_delete_recordings_post(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    """Preferred delete endpoint (reliable JSON body; DELETE+body is often dropped)."""
    return _projects_delete_recordings_impl(project_id, body)


@app.delete("/v1/projects/{project_id}/recordings")
def projects_delete_recordings(
    project_id: str,
    body: DeleteRecordingsRequest,
) -> dict[str, Any]:
    return _projects_delete_recordings_impl(project_id, body)


@app.post("/v1/projects/{project_id}/init", status_code=201)
def projects_init(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import init_job_params

    try:
        params = init_job_params(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return jobs_create(CreateJobRequest(command="init", params=params))


@app.post("/v1/projects/{project_id}/recordings/sync-table", status_code=201)
def projects_sync_table(project_id: str, body: SyncTableRequest | None = None) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import sync_table_job_params

    req = body or SyncTableRequest()
    try:
        params = sync_table_job_params(
            project_id,
            overwrite=req.overwrite,
            update_table=req.update_table,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return jobs_create(
        CreateJobRequest(command="create-recording-table", params=params)
    )


@app.get("/v1/projects/{project_id}/recording-table")
def projects_recording_table(project_id: str) -> dict[str, Any]:
    """Full recording_table.csv + computed columns (вкладка «Записи»)."""
    from orcai_desktop_sidecar.project_studio import read_recording_table

    try:
        return read_recording_table(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/v1/projects/{project_id}/recording-table/rows/{recording}")
def projects_recording_table_channel(
    project_id: str,
    recording: str,
    body: RecordingChannelRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import set_recording_channel

    try:
        return set_recording_channel(project_id, recording, body.channel)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/projects/{project_id}/annotations")
def projects_annotations(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import annotations_matrix

    try:
        return annotations_matrix(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/v1/projects/{project_id}/annotations/import")
def projects_import_annotations(
    project_id: str,
    body: ImportRecordingsRequest,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import import_annotations

    try:
        return import_annotations(project_id, body.paths)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/projects/{project_id}/annotations/delete")
def projects_delete_annotations(
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
        return delete_annotations(project_id, names)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/v1/projects/{project_id}/artifacts")
def projects_artifacts(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import list_artifacts

    try:
        return list_artifacts(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/v1/projects/{project_id}/pipeline")
def projects_pipeline(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.train_pipeline import get_project_pipeline

    try:
        return get_project_pipeline(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class SnippetCalculatorRequest(BaseModel):
    calls: list[str] = Field(default_factory=list)
    equivalences: dict[str, str] = Field(default_factory=dict)
    snippets: dict[str, Any] = Field(default_factory=dict)
    batch_size: int = 64
    seed: int | None = None


@app.post("/v1/projects/{project_id}/snippet-calculator")
def projects_snippet_calculator(
    project_id: str,
    body: SnippetCalculatorRequest,
) -> dict[str, Any]:
    """Train wizard: expected snippets per split and suggested n_batch_*."""
    from orcai_desktop_sidecar.snippet_calculator import calculate_snippets

    try:
        return calculate_snippets(project_id, body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/v1/projects/{project_id}/train-monitor")
def projects_train_monitor(project_id: str) -> dict[str, Any]:
    """Live / last train metrics for monitor (m14)."""
    from orcai_desktop_sidecar.train_monitor import get_project_train_monitor

    try:
        return get_project_train_monitor(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/v1/projects/{project_id}/parameters")
def projects_parameters_get(project_id: str) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import read_parameters

    try:
        return read_parameters(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/v1/projects/{project_id}/parameters/validate")
def projects_parameters_validate(project_id: str, body: ParameterTextRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_registry import get_project
    from orcai_desktop_sidecar.project_studio import validate_parameters_text

    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return validate_parameters_text(body.text)


@app.put("/v1/projects/{project_id}/parameters")
def projects_parameters_put(project_id: str, body: ParameterTextRequest) -> dict[str, Any]:
    from orcai_desktop_sidecar.project_studio import write_parameters

    try:
        return write_parameters(project_id, body.text)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/recording-tables/preview")
def recording_table_preview(path: str, limit: int = 50) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    import pandas as pd

    from orcai_desktop_sidecar.paths import resolve_user_csv_path

    try:
        csv_path = resolve_user_csv_path(path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    df = pd.read_csv(csv_path, index_col=0)
    preview = df.head(limit).reset_index().to_dict(orient="records")
    return {
        "path": str(csv_path.resolve()),
        "row_count": len(df),
        "columns": list(df.columns),
        "preview": preview,
    }


@app.post("/v1/labels/export-audacity")
def labels_export_audacity(body: ExportAudacityParams) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from pathlib import Path

    from orcai_desktop_sidecar.adapters.labels import (
        export_audacity_labels,
        labels_to_audacity_text,
    )
    from orcai_desktop_sidecar.paths import resolve_user_path

    try:
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
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc


@app.get("/v1/labels/preview")
def labels_preview(
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

    try:
        label_resolved = resolve_user_label_path(path)
        wav_resolved = (
            str(resolve_user_path(wav_path, expect_wav=True)) if wav_path else None
        )
        return preview(
            str(label_resolved),
            wav_path=wav_resolved,
            channel=channel,
            orcai_parameter_path=orcai_parameter,
            compute_tf_bounds=compute_tf_bounds,
            windowed=windowed,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc


@app.get("/v1/results/summary")
def results_summary(
    project_dir: str,
    source: str = "predicted",
) -> dict[str, Any]:
    from orcai_desktop_sidecar.adapters.results_summary import build_results_summary
    from orcai_desktop_sidecar.paths import resolve_user_dir

    kind = source.strip().lower()
    if kind not in {"predicted", "filtered", "annotations"}:
        raise HTTPException(
            status_code=400, detail="source must be predicted, filtered, or annotations"
        )
    try:
        scan_root = str(resolve_user_dir(project_dir))
        return build_results_summary(scan_root, source=kind)  # type: ignore[arg-type]
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/results/predictions")
def results_predictions(
    project_dir: str | None = None,
    directory: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:

    from orcai_desktop_sidecar.paths import resolve_user_dir
    from orcai_desktop_sidecar.store import (
        connect,
        list_predictions,
        project_db_path,
        scan_label_files,
    )

    items: list[dict[str, Any]] = []
    db_path = None
    scan_root: str | None = None

    try:
        if project_dir:
            scan_root = str(resolve_user_dir(project_dir))
            db_path = project_db_path(scan_root)
            conn = connect(db_path)
            items.extend(list_predictions(conn, project_dir=scan_root, limit=limit))
            items.extend(
                {
                    "label_path": f["label_path"],
                    "kind": f["kind"],
                    "name": f["name"],
                    "source": "filesystem",
                }
                for f in scan_label_files(scan_root, limit=limit)
            )
        elif directory:
            scan_root = str(resolve_user_dir(directory))
            items.extend(
                {
                    "label_path": f["label_path"],
                    "kind": f["kind"],
                    "name": f["name"],
                    "source": "filesystem",
                }
                for f in scan_label_files(scan_root, limit=limit)
            )
        else:
            conn = connect()
            items.extend(list_predictions(conn, limit=limit))
    except PermissionError as exc:
        raise _path_http_errors(exc) from exc
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # De-duplicate by label_path
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        key = item.get("label_path") or item.get("name", "")
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return {
        "items": unique[:limit],
        "db_path": str(db_path) if db_path else None,
        "scan_dir": scan_root,
    }


@app.get("/v1/results/test-metrics")
def results_test_metrics(
    model_dir: str | None = None,
    project_dir: str | None = None,
    data_dir: str | None = None,
) -> dict[str, Any]:
    from orcai_desktop_sidecar.adapters.results_metrics import collect_test_metrics

    if not any((model_dir, project_dir, data_dir)):
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of model_dir, project_dir, data_dir",
        )
    return collect_test_metrics(
        model_dir=model_dir,
        project_dir=project_dir,
        data_dir=data_dir,
    )


def _path_http_errors(exc: Exception) -> HTTPException:
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@app.get("/v1/spectrogram/meta")
def spectrogram_meta(
    path: str,
    orcai_parameter: str | None = None,
) -> dict[str, Any]:
    if not orcai_available():
        raise HTTPException(status_code=503, detail="orcai is not installed")
    from orcai_desktop_sidecar.adapters.spectrogram import get_spectrogram_meta
    from orcai_desktop_sidecar.paths import resolve_user_path

    try:
        resolved = resolve_user_path(path, expect_wav=True)
        return get_spectrogram_meta(str(resolved), orcai_parameter=orcai_parameter)
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise _path_http_errors(exc) from exc


@app.post("/v1/spectrogram/warm")
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
            _spec_executor,
            lambda: ensure_orcai_spectrogram_cached(
                str(resolved),
                channel=channel,
                orcai_parameter=orcai_parameter,
                windowed=windowed,
            ),
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise _path_http_errors(exc) from exc


@app.get("/v1/spectrogram/histogram")
def spectrogram_histogram(
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

    try:
        resolved = resolve_user_path(path, expect_wav=True)
        return hist(
            str(resolved),
            t0=t0,
            t1=t1,
            channel=channel,
            orcai_parameter=orcai_parameter,
            display_kind=display_kind,
            bins=bins,
            windowed=windowed,
        )
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise _path_http_errors(exc) from exc


@app.post("/v1/spectrograms/cache/clear")
def spectrograms_cache_clear() -> dict[str, Any]:
    """Delete spectrogram tile cache (disk + RAM)."""
    from orcai_desktop_sidecar.maintenance import clear_spectrogram_tile_cache

    return clear_spectrogram_tile_cache()


@app.post("/v1/maintenance/factory-reset")
def maintenance_factory_reset() -> dict[str, Any]:
    """Wipe Desktop SQLite (jobs/projects) and spectrogram cache.

    Does not delete user WAV/annotation folders. Preferences are reset in the UI.
    """
    from orcai_desktop_sidecar.maintenance import factory_reset_desktop

    return factory_reset_desktop()


@app.get("/v1/spectrogram/tile")
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
            _spec_executor,
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
        raise _path_http_errors(exc) from exc
    except Exception as exc:
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


@app.get("/v1/spectrogram/waveform")
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
            _spec_executor,
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
        raise _path_http_errors(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(content=png, media_type="image/png")


@app.get("/v1/audio/playback")
def audio_playback(path: str, channel: int = 1) -> FileResponse:
    """Mono WAV for HTML audio (cached); respects spectrogram channel."""
    from orcai_desktop_sidecar.adapters.audio import ensure_mono_playback_wav
    from orcai_desktop_sidecar.paths import resolve_user_path

    try:
        resolved = resolve_user_path(path, expect_wav=True)
        wav = ensure_mono_playback_wav(resolved, channel)
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise _path_http_errors(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        wav,
        media_type="audio/wav",
        filename=wav.name,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.get("/v1/audio/segment")
def audio_segment(
    path: str,
    channel: int = 1,
    t0: float = 0.0,
    t1: float = 1.0,
) -> FileResponse:
    """Short mono WAV clip for segment preview."""

    from orcai_desktop_sidecar.adapters.audio import _CACHE_DIR, _cache_key, write_wav_segment
    from orcai_desktop_sidecar.paths import resolve_user_path

    try:
        src = resolve_user_path(path, expect_wav=True)
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        ch = max(1, int(channel))
        key = _cache_key(src, ch)
        out = _CACHE_DIR / f"{key}_seg_{t0:.3f}_{t1:.3f}.wav"
        if not out.is_file():
            write_wav_segment(src, ch, t0, t1, out)
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise _path_http_errors(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        out,
        media_type="audio/wav",
        filename=out.name,
        headers={"Cache-Control": "private, max-age=3600"},
    )


def run() -> None:
    import os

    import uvicorn

    port = int(os.environ.get("ORCAI_DESKTOP_PORT", "8741"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    run()
