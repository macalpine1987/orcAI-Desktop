"""Dispatch sidecar jobs to orcAI adapters."""

from __future__ import annotations

import logging
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.audio_import import run_import_audio
from orcai_desktop_sidecar.adapters.helpers_cmd import (
    run_create_recording_table,
    run_init_project,
)
from orcai_desktop_sidecar.adapters.predict import run_filter_predictions, run_predict
from orcai_desktop_sidecar.adapters.training import (
    run_create_label_arrays,
    run_create_snippet_table,
    run_create_spectrograms,
    run_create_tvt_data,
    run_create_tvt_snippet_tables,
    run_hpsearch,
    run_test,
    run_train,
)
from orcai_desktop_sidecar.cli_command import build_command_line
from orcai_desktop_sidecar.job_cancel import (
    JobCancelled,
    clear_worker,
)
from orcai_desktop_sidecar.job_cancel import (
    check as check_cancelled,
)
from orcai_desktop_sidecar.job_cancel import (
    clear as clear_cancel,
)
from orcai_desktop_sidecar.jobs import JobStatus, append_log, set_status

_log = logging.getLogger(__name__)

Handler = Callable[[str, dict[str, Any]], dict[str, Any]]

_HANDLERS: dict[str, Handler] = {
    "import-audio": run_import_audio,
    "predict": run_predict,
    "filter-predictions": run_filter_predictions,
    "init": run_init_project,
    "create-recording-table": run_create_recording_table,
    "create-spectrograms": run_create_spectrograms,
    "create-label-arrays": run_create_label_arrays,
    "create-snippet-table": run_create_snippet_table,
    "create-tvt-snippet-tables": run_create_tvt_snippet_tables,
    "create-tvt-data": run_create_tvt_data,
    "hpsearch": run_hpsearch,
    "train": run_train,
    "test": run_test,
}

IMPLEMENTED_COMMANDS = frozenset(_HANDLERS)

# Output-only keys that may supplement created_files when handlers forget.
# Never include inputs (recording_path, wav_path, data_dir, model_dir, …).
_OUTPUT_RESULT_KEYS = (
    "label_path",
    "output_path",
    "output_file",
    "output_dir",
    "tvt_dir",  # create-tvt-data writes into this tree
)


def _absolute_created_files(result: dict[str, Any]) -> list[str]:
    """Absolute paths of *created* artifacts only."""
    found: list[str] = []
    existing = result.get("created_files") or result.get("artifacts")
    if isinstance(existing, list):
        for item in existing:
            try:
                path = Path(str(item))
                if path.exists():
                    found.append(str(path.resolve()))
            except OSError:
                continue
    # Fallback for older handlers: output keys only, never inputs.
    if not found:
        for key in _OUTPUT_RESULT_KEYS:
            value = result.get(key)
            if not value or str(value) == "default":
                continue
            try:
                path = Path(str(value))
                if path.exists():
                    found.append(str(path.resolve()))
            except OSError:
                continue
    return list(dict.fromkeys(found))


def run_job(job_id: str, command: str, params: dict[str, Any]) -> None:
    restore_tqdm = None
    try:
        check_cancelled(job_id)
        handler = _HANDLERS.get(command)
        if handler is None:
            set_status(
                job_id,
                JobStatus.FAILED,
                error=f"Command not implemented yet: {command}",
                exit_code=1,
                command_line=build_command_line(command, params),
            )
            append_log(job_id, f"Available: {', '.join(sorted(IMPLEMENTED_COMMANDS))}")
            return

        command_line = build_command_line(command, params)
        set_status(
            job_id,
            JobStatus.RUNNING,
            command_line=command_line,
        )
        check_cancelled(job_id)
        append_log(job_id, f"Running orcAI: {command}")
        from orcai_desktop_sidecar.progress_tqdm import install_job_tqdm

        restore_tqdm = install_job_tqdm(job_id)
        result = handler(job_id, params)
        if isinstance(result, dict):
            # Prefer CLI params actually passed to the engine (after aliases / inject).
            cli_params = result.pop("cli_params", None)
            if isinstance(cli_params, dict) and cli_params:
                command_line = build_command_line(command, cli_params)
        if isinstance(result, dict) and result.get("cancelled"):
            artifacts = _absolute_created_files(result)
            result = {**result, "created_files": artifacts, "incomplete": True}
            set_status(
                job_id,
                JobStatus.CANCELLED,
                error="Cancelled by user",
                result=result,
                exit_code=130,
                artifacts=artifacts,
                command_line=command_line,
            )
            append_log(job_id, "Cancelled by user.")
            return
        check_cancelled(job_id)
        if not isinstance(result, dict):
            result = {"value": result}
        artifacts = _absolute_created_files(result)
        result = {**result, "created_files": artifacts}
        set_status(
            job_id,
            JobStatus.COMPLETED,
            result=result,
            exit_code=0,
            artifacts=artifacts,
            command_line=command_line,
        )
        append_log(job_id, "Completed successfully.")
        _record_prediction_result(command, job_id, result, params)
        _pin_pipeline_param_fingerprint(command, params)
    except JobCancelled:
        partial = None
        try:
            from orcai_desktop_sidecar.jobs import get_job

            job = get_job(job_id)
            if job and isinstance(job.result, dict):
                partial = job.result
        except Exception:  # noqa: BLE001 — best-effort partial result on cancel
            _log.debug("could not load partial result for %s", job_id, exc_info=True)
        set_status(
            job_id,
            JobStatus.CANCELLED,
            error="Cancelled by user",
            result=partial,
            exit_code=130,
        )
        append_log(job_id, "Cancelled by user.")
    except SystemExit as exc:
        # orcAI helpers sometimes call sys.exit(); must not leave the job RUNNING forever
        # (UI stays busy → «Обновить таблицу» stuck disabled).
        code = exc.code
        exit_code = code if isinstance(code, int) else 1
        msg = f"Engine exited (sys.exit): {code!r}"
        set_status(job_id, JobStatus.FAILED, error=msg, exit_code=exit_code)
        append_log(job_id, f"Error: {msg}")
        append_log(job_id, traceback.format_exc())
    except Exception as exc:  # noqa: BLE001 — job boundary; error logged + returned to UI
        # Preserve the engine/exception message verbatim for the UI.
        set_status(job_id, JobStatus.FAILED, error=str(exc), exit_code=1)
        append_log(job_id, f"Error: {exc}")
        append_log(job_id, traceback.format_exc())
    finally:
        if restore_tqdm is not None:
            try:
                restore_tqdm()
            except Exception:  # noqa: BLE001 — tqdm restore must not mask job outcome
                _log.debug("restore_tqdm failed for %s", job_id, exc_info=True)
        clear_cancel(job_id)
        clear_worker(job_id)
        # Scheduler slot is released by the parent (jobs_create finalize / cancel),
        # not here — run_job may execute inside a spawned worker process.


def _pin_pipeline_param_fingerprint(command: str, params: dict[str, Any]) -> None:
    """Remember which params produced this step so later unrelated JSON edits stay done."""
    try:
        from orcai_desktop_sidecar.train_pipeline import (
            TRAIN_STEP_IDS,
            record_step_param_fingerprint,
        )

        if command not in TRAIN_STEP_IDS:
            return
        project_dir = params.get("project_dir")
        if not project_dir:
            return
        orcai_parameter = params.get("orcai_parameter")
        record_step_param_fingerprint(
            Path(str(project_dir)),
            command,
            orcai_parameter=str(orcai_parameter) if orcai_parameter else None,
        )
    except Exception:  # noqa: BLE001 — fingerprint pin is best-effort
        _log.debug("pipeline param fingerprint pin failed for %s", command, exc_info=True)


def _record_prediction_result(
    command: str,
    job_id: str,
    result: dict[str, Any],
    params: dict[str, Any],
) -> None:
    try:
        from orcai_desktop_sidecar.jobs import JobStatus, get_job
        from orcai_desktop_sidecar.store import (
            connect,
            project_db_path,
            record_prediction,
        )

        job = get_job(job_id)
        if job and job.status == JobStatus.CANCELLED:
            return

        label_path = result.get("label_path")
        if not label_path or command not in ("predict", "filter-predictions"):
            return
        project_dir = params.get("project_dir")
        for db in (
            connect(),
            connect(project_db_path(project_dir)) if project_dir else None,
        ):
            if db is None:
                continue
            record_prediction(
                db,
                label_path=str(label_path),
                wav_path=result.get("wav_path") or params.get("recording_path"),
                model=result.get("model"),
                command=command,
                job_id=job_id,
                project_dir=project_dir,
            )
    except Exception:  # noqa: BLE001 — prediction index is best-effort side effect
        _log.debug("record_prediction failed for job %s", job_id, exc_info=True)


def orcai_available() -> bool:
    try:
        import orcai  # noqa: F401

        return True
    except ImportError:
        return False
