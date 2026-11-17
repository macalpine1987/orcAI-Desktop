"""predict and filter-predictions adapters (engine defaults via pass-through).

Façade: public API re-exported from split modules so imports and test patches
(``adapters.predict._messenger``, ``adapters.predict.os.close``,
``adapters.predict.tempfile.mkstemp``) keep working.
"""

from __future__ import annotations

import os
import tempfile
import time
from importlib.resources import files
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.engine_call import (
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
)

from orcai_desktop_sidecar.adapters.predict_batch import (
    _collect_csv_batch_files,
    _normalize_recording_names,
    collect_csv_batch_files,
    sanitize_csv_base_dir_recording,
)
from orcai_desktop_sidecar.adapters.predict_paths import (
    PREDICT_SELECTION_CSV_NAME,
    PREDICT_SELECTION_DIRNAME,
    _resolve_model_dir_if_requested,
    predict_selection_csv_path,
    resolve_call_duration_limits,
    resolve_csv_batch_label_path,
    resolve_filtered_output_path,
    resolve_predict_output_path,
)
from orcai_desktop_sidecar.adapters.predict_progress import (
    PREDICT_FILE_LOG_RE,
    _restore_predict_tqdm,
    _with_predict_file_tqdm,
)
from orcai_desktop_sidecar.adapters.predict_recording import (
    prepare_predict_recording_path,
)

# Re-export for callers / patches (os & tempfile kept on this module for A0 tests).
__all__ = [
    "PREDICT_FILE_LOG_RE",
    "PREDICT_SELECTION_CSV_NAME",
    "PREDICT_SELECTION_DIRNAME",
    "_collect_csv_batch_files",
    "_messenger",
    "_normalize_recording_names",
    "collect_csv_batch_files",
    "predict_selection_csv_path",
    "prepare_predict_recording_path",
    "resolve_call_duration_limits",
    "resolve_csv_batch_label_path",
    "resolve_filtered_output_path",
    "resolve_predict_output_path",
    "run_filter_predictions",
    "run_predict",
    "sanitize_csv_base_dir_recording",
]


def _messenger(job_id: str, params: dict[str, Any], title: str) -> Any:
    from orcai_desktop_sidecar.messenger import JobMessenger

    # Verbosity for logging only; if omitted, match orcAI predict default (2).
    verbosity = int(params["verbosity"]) if "verbosity" in params else 2
    return JobMessenger(job_id, verbosity=verbosity, title=title)


def run_predict(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    if "recording_path" not in params or not params["recording_path"]:
        raise ValueError("recording_path is required")

    from orcai.predict import predict

    from orcai_desktop_sidecar.jobs import set_progress

    set_progress(job_id, 0.0)
    msgr = _messenger(job_id, params, "Predicting calls")
    inject: dict[str, Any] = {"msgr": msgr}
    job_started = time.time()
    model_dir = _resolve_model_dir_if_requested(params)
    if model_dir is not None:
        inject["model_dir"] = model_dir
        msgr.info(f"Model: {model_dir.name}")

    limits = resolve_call_duration_limits(params)
    if limits is not None:
        inject["call_duration_limits"] = limits

    source = Path(str(params["recording_path"])).expanduser().resolve()
    recording_names = _normalize_recording_names(params.get("recording_names"))
    predict_path, temp_csv = prepare_predict_recording_path(
        source,
        recording_names=recording_names,
        job_id=job_id,
        project_dir=params.get("project_dir") if isinstance(params.get("project_dir"), str) else None,
    )
    job_params = dict(params)
    job_params["recording_path"] = str(predict_path)

    is_csv = predict_path.suffix.lower() == ".csv"
    job_params = sanitize_csv_base_dir_recording(
        job_params,
        is_csv=is_csv,
        project_dir=params.get("project_dir")
        if isinstance(params.get("project_dir"), str)
        else None,
        warn=lambda msg: msgr.warning(msg),
    )

    kwargs = engine_kwargs(
        predict,
        job_params,
        required=("recording_path",),
        inject=inject,
        skip=frozenset(
            {
                "model_dir",
                "call_duration_limits",
                "msgr",
                "recording_names",
                "project_dir",
            }
        ),
    )

    original_tqdm = None
    try:
        if is_csv:
            if recording_names:
                msgr.info(
                    f"Batch predict via recording table ({len(recording_names)} files)"
                )
            else:
                msgr.info("Batch predict via recording table")
            original_tqdm = _with_predict_file_tqdm(job_id, msgr)
            # Stay at 0 until tqdm ticks — avoids a fake 2% on the dock strip.
        else:
            # Single WAV: no orcAI tqdm — structured line only; keep progress at 0
            # so the dock shows indeterminate until completion (1.0).
            msgr.print(
                f"[predict-file] 1/1 {source.stem}",
                severity=1,
            )
        from orcai_desktop_sidecar.parameter_guard import reject_predict_channels

        reject_predict_channels(
            kwargs["recording_path"],
            channel=kwargs.get("channel", 1),
            base_dir_recording=kwargs.get("base_dir_recording"),
        )
        predict(**kwargs)

        effective_model = Path(
            kwargs.get(
                "model_dir",
                str(files("orcai.models").joinpath("orcai-isl-v1")),
            )
        )
        channel = int(kwargs.get("channel", 1))
        output_param = kwargs.get("output_path", "default")

        if is_csv:
            batch_table = predict_path if predict_path.is_file() else source
            batch_files = collect_csv_batch_files(
                batch_table,
                model_dir=effective_model,
                output_param=output_param,
                project_dir=params.get("project_dir")
                if isinstance(params.get("project_dir"), str)
                else None,
                min_mtime=job_started,
            )
            created = collect_created(
                *[f.get("label_path") for f in batch_files if f.get("label_path")]
            )
            set_progress(job_id, 1.0)
            succeeded = sum(1 for f in batch_files if f.get("status") == "completed")
            msgr.success(f"Batch finished: {succeeded}/{len(batch_files)} files")
            return {
                "recording_path": str(source),
                "batch": True,
                "model": effective_model.stem,
                "output_path": str(output_param),
                "label_path": batch_files[0].get("label_path") if batch_files else None,
                "wav_path": None,
                "files": batch_files,
                "created_files": created,
                "cli_params": cli_params_from_engine(kwargs),
            }

        label_file = resolve_predict_output_path(
            source, channel, effective_model, output_param
        )
        wav = str(source) if source.suffix.lower() == ".wav" else None
        label_path = str(label_file) if label_file.is_file() else None
        created = collect_created(label_path)
        set_progress(job_id, 1.0)

        return {
            "recording_path": str(source),
            "model": effective_model.stem,
            "output_path": str(output_param),
            "label_path": label_path,
            "wav_path": wav,
            "created_files": created,
            "cli_params": cli_params_from_engine(kwargs),
        }
    finally:
        if original_tqdm is not None:
            _restore_predict_tqdm(original_tqdm)
        if temp_csv is not None and temp_csv.is_file() and temp_csv != source:
            try:
                temp_csv.unlink()
            except OSError:
                pass


def run_filter_predictions(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.predict import filter_predictions_file

    predicted = params.get("predicted_labels") or params.get("predicted_labels_path")
    if not predicted:
        raise ValueError("predicted_labels (path to .txt) is required")

    msgr = _messenger(job_id, params, "Filtering predictions")
    job_params = dict(params)
    job_params["predicted_labels_path"] = predicted

    inject: dict[str, Any] = {"msgr": msgr}
    limits = resolve_call_duration_limits(params)
    if limits is not None:
        inject["call_duration_limits"] = limits
        msgr.info(f"Call duration limits: {limits}")

    kwargs = engine_kwargs(
        filter_predictions_file,
        job_params,
        required=("predicted_labels_path",),
        inject=inject,
        skip=frozenset({"call_duration_limits", "msgr"}),
    )

    filter_predictions_file(**kwargs)

    output_param = kwargs.get("output_file", "default")
    if str(output_param) == "default":
        label_file = resolve_filtered_output_path(predicted)
    else:
        label_file = Path(str(output_param)).resolve()

    label_path = str(label_file) if label_file.is_file() else None
    return {
        "predicted_labels": str(Path(predicted).resolve()),
        "output_file": str(output_param),
        "label_path": label_path,
        "created_files": collect_created(label_path),
        "cli_params": cli_params_from_engine(
            kwargs, predicted_labels=str(Path(predicted).resolve())
        ),
    }
