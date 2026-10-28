"""Subprocess entry point for long-running orcAI jobs."""

from __future__ import annotations

from typing import Any


def run_job_in_worker(job_id: str, command: str, params: dict[str, Any]) -> None:
    import os
    import traceback

    from orcai_desktop_sidecar.compute_device import (
        apply_compute_device_env,
        configure_tensorflow_for_device,
        resolve_job_compute_device,
    )
    from orcai_desktop_sidecar.job_memory import (
        HEAVY_TF_COMMANDS,
        apply_worker_memory_guard,
    )
    from orcai_desktop_sidecar.jobs import JobStatus, append_log, bootstrap_jobs, set_status

    try:
        # Own process group so cancel can SIGKILL the whole tree (TF helper threads).
        if hasattr(os, "setpgrp"):
            try:
                os.setpgrp()
            except OSError:
                pass

        apply_worker_memory_guard(command)

        bootstrap_jobs()

        # Running before TF configure so Jobs / Pipeline show «Выполняется»
        # during the long import (parent SSE also relies on this for in-process).
        set_status(job_id, JobStatus.RUNNING)

        device = resolve_job_compute_device()
        apply_compute_device_env(device)

        # Hide Metal/CUDA *before* orcAI imports TF (train hardcodes /GPU:0).
        # Skip only trivial helpers that never touch TensorFlow.
        if command not in ("init", "create-recording-table", "import-audio"):
            try:
                configure_tensorflow_for_device(device)
                if device == "cpu":
                    append_log(
                        job_id,
                        "Compute device: CPU (GPU/Metal hidden for this job).",
                    )
                else:
                    append_log(job_id, "Compute device: GPU.")
            except Exception as tf_exc:  # noqa: BLE001 — log; job may still run
                append_log(job_id, f"Compute device setup warning: {tf_exc}")
                if command in HEAVY_TF_COMMANDS and device == "cpu":
                    # Fail closed for heavy jobs: do not train on Metal by accident.
                    set_status(
                        job_id,
                        JobStatus.FAILED,
                        error=(
                            "CPU mode requested but TensorFlow GPU could not be "
                            f"disabled: {tf_exc}"
                        ),
                        exit_code=1,
                    )
                    return

        from orcai_desktop_sidecar.runner import run_job

        run_job(job_id, command, params)
    except Exception as exc:  # noqa: BLE001 — worker boundary; error logged + set on job
        set_status(job_id, JobStatus.FAILED, error=str(exc))
        append_log(job_id, f"Worker failed: {exc}")
        append_log(job_id, traceback.format_exc())
