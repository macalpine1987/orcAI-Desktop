"""Local HTTP API for orcAI Desktop."""

from __future__ import annotations

import contextlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from orcai_desktop_sidecar.runner import (
    IMPLEMENTED_COMMANDS,
    orcai_available,
)
from orcai_desktop_sidecar.runtime_state import spec_executor
from orcai_desktop_sidecar.routes import fs, jobs, media, models, projects, runtime
from orcai_desktop_sidecar.schemas import (  # noqa: F401 — re-export for tests
    ClearJobsRequest,
    CreateJobRequest,
    CreateProjectRequest,
    CreateRecordingTableParams,
    DeleteRecordingsRequest,
    EngineStartRequest,
    ExportAudacityParams,
    FilterPreviewRequest,
    FsWriteTextRequest,
    ImportRecordingsRequest,
    InitProjectParams,
    JobsQueuePatch,
    ModelsCompatibilityBody,
    ModelsExportBody,
    ModelsImportBody,
    ParameterTextRequest,
    PredictJobParams,
    RecordingChannelRequest,
    RegisterProjectRequest,
    SnippetCalculatorRequest,
    SyncTableRequest,
    UpdateProjectRequest,
)

# Re-export route callables tests import from main.
from orcai_desktop_sidecar.routes.jobs import (  # noqa: F401
    jobs_cancel,
    jobs_cancel_active,
    jobs_clear,
    jobs_create,
    jobs_create_recording_table,
    jobs_events,
    jobs_get,
    jobs_init_project,
    jobs_list,
    jobs_log_since,
    jobs_predict,
    jobs_queue_patch,
    jobs_queue_status,
    jobs_retry,
)
from orcai_desktop_sidecar.routes.runtime import (  # noqa: F401
    capabilities,
    engine_start,
    engine_stop,
    health,
)

app = FastAPI(title="orcAI Desktop Sidecar", version="0.1.5")


@app.on_event("startup")
def _startup() -> None:
    # Runtime contract: docs/RUNTIME_CONTRACT.md — process start ≠ UI autostart.
    from orcai_desktop_sidecar.jobs import bootstrap_jobs, cancel_jobs_on_shutdown
    from orcai_desktop_sidecar.store import APP_DIR

    bootstrap_jobs()
    # A new process has no workers. Drop leftover pending/running rows even
    # when the previous exit did not leave a crash marker.
    with contextlib.suppress(Exception):
        cancel_jobs_on_shutdown()
    marker = APP_DIR / "sidecar-crashed"
    if marker.is_file():
        marker.unlink(missing_ok=True)


@app.on_event("shutdown")
def _shutdown() -> None:
    # Process exit only (Quit / stopSidecar). Hide-on-close does not run this.
    # See docs/RUNTIME_CONTRACT.md.
    from orcai_desktop_sidecar.jobs import cancel_jobs_on_shutdown, stop_log_flush_timer

    with contextlib.suppress(Exception):
        cancel_jobs_on_shutdown()
    with contextlib.suppress(Exception):
        stop_log_flush_timer()
    with contextlib.suppress(Exception):
        from orcai_desktop_sidecar.engine import stop_engine

        stop_engine()
    with contextlib.suppress(Exception):
        from orcai_desktop_sidecar.job_queue import stop_scheduler

        stop_scheduler(wait=False)
    with contextlib.suppress(Exception):
        spec_executor.shutdown(wait=False, cancel_futures=True)


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

app.include_router(fs.router)
app.include_router(runtime.router)
app.include_router(models.router)
app.include_router(jobs.router)
app.include_router(projects.router)
app.include_router(media.router)


# Keep in sync with SIDECAR_DEFAULT_PORT in src-tauri/src/sidecar.rs
# and apps/ui/src/api/sidecar.ts.
SIDECAR_DEFAULT_PORT = 8741


def run() -> None:
    import os

    import uvicorn

    port = int(os.environ.get("ORCAI_DESKTOP_PORT", str(SIDECAR_DEFAULT_PORT)))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    run()
