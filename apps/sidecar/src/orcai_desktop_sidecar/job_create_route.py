"""Job create orchestration — extracted from HTTP routes (behavior unchanged)."""

from __future__ import annotations

import contextlib
import multiprocessing
import os
import threading
import time
from typing import Any

from fastapi import HTTPException

from orcai_desktop_sidecar.jobs import (
    append_log,
    create_job,
    job_to_dict,
)
from orcai_desktop_sidecar.routes.common import orcai_available
from orcai_desktop_sidecar.runtime_state import ALL_COMMANDS, inprocess_job_lock
from orcai_desktop_sidecar.schemas import CreateJobRequest


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
        _INPROCESS_COMMANDS = frozenset(ALL_COMMANDS) | frozenset({"import-audio"})

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
        from orcai_desktop_sidecar.job_cancel import register_thread
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
            from orcai_desktop_sidecar.job_cancel import clear as clear_cancel

            try:
                with inprocess_job_lock:
                    run_job_in_worker(job_id, command, params)
                _finalize_orphaned_job(job_id, exitcode=0)
            finally:
                # Parent owns cancel-event lifetime for spawn; clear_worker alone
                # leaves _cancel_events entries after terminal jobs.
                clear_cancel(job_id)
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
        from orcai_desktop_sidecar.job_cancel import clear as clear_cancel

        try:
            proc.join()
            clear_cancel(job_id)
            _finalize_orphaned_job(job_id, exitcode=proc.exitcode)
        finally:
            with contextlib.suppress(Exception):
                from orcai_desktop_sidecar.sleep_prevent import release_keep_awake

                release_keep_awake(job_id)

    def _start_worker(job_id: str, command: str, params: dict[str, Any]) -> None:
        from orcai_desktop_sidecar.job_cancel import (
            clear as clear_cancel,
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
            clear_cancel(job_id)
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


