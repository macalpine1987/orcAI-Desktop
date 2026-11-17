"""Train and test model adapters (orcAI steps)."""

from __future__ import annotations

import contextlib
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.training_common import (
    _messenger,
    _read_json_dict,
    _reject_orcai_parameter,
    _run_with_artifacts,
)
from orcai_desktop_sidecar.adapters.training_hps import (
    _apply_best_hyperparameters_before_train,
)
from orcai_desktop_sidecar.adapters.training_params import (
    abs_str,
    cleanup_temp_orcai_parameter as _cleanup_temp_orcai_parameter,
    prepare_read_params as _prepare_read_params,
)
from orcai_desktop_sidecar.adapters.training_snippet_prep import (
    _clamp_n_batches_to_snippets,
)
from orcai_desktop_sidecar.engine_call import (
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
    snapshot_files,
)
from orcai_desktop_sidecar.model_paths import resolve_trained_model_dir


def run_train(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.train import train

    from orcai_desktop_sidecar.train_live import install_train_fit_hook

    prepared = _prepare_read_params(params)
    msgr = _messenger(job_id, params, "Training model")
    project_dir_raw = params.get("project_dir")
    project_dir = (
        Path(str(project_dir_raw)).expanduser()
        if isinstance(project_dir_raw, (str, Path)) and str(project_dir_raw).strip()
        else None
    )
    # Finetune keeps base network shape — do not overwrite with hpsearch winners.
    # TRN-01: merge only when the job opts in (wizard/board after hpsearch).
    is_finetune = bool(
        prepared.get("load_model") or prepared.get("load_model_from")
    )
    apply_best = bool(prepared.get("apply_best_hyperparameters"))
    if (
        apply_best
        and not is_finetune
        and "orcai_parameter" in prepared
        and project_dir is not None
    ):
        hps_hint = prepared.get("hps_parameter")
        hps_path: Path | None = None
        if isinstance(hps_hint, (str, Path)) and str(hps_hint).strip():
            candidate = Path(str(hps_hint)).expanduser()
            if candidate.is_file():
                hps_path = candidate
        if hps_path is None and project_dir.is_dir():
            # Newest wizard/manual *_hps_parameter.json in the project root.
            try:
                matches = sorted(
                    (
                        p
                        for p in project_dir.glob("*_hps_parameter.json")
                        if p.is_file() and not p.name.startswith(".")
                    ),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True,
                )
                hps_path = matches[0] if matches else None
            except OSError:
                hps_path = None
        prepared["orcai_parameter"] = _apply_best_hyperparameters_before_train(
            prepared.get("orcai_parameter"),
            project_dir=project_dir,
            hps_parameter_path=hps_path,
            msgr=msgr,
        )
    # Clamp n_batch for live monitor / temp -p when snippets still exist, but do
    # not invent a hard fail: orcAI train() loads TF datasets and does not
    # re-check snippet inventory (create-tvt uses non-strict clamp + orcAI ValueError).
    data_hint = prepared.get("data_dir")
    snippet_path: Path | None = None
    if isinstance(data_hint, (str, Path)) and str(data_hint).strip():
        root = Path(str(data_hint)).expanduser()
        for name in ("all_snippets.csv.gz", "all_snippets.csv"):
            candidate = root / name
            if candidate.is_file():
                snippet_path = candidate
                break
    if "orcai_parameter" in prepared:
        prepared["orcai_parameter"] = _clamp_n_batches_to_snippets(
            prepared.get("orcai_parameter"),
            snippet_path,
            msgr=msgr,
            strict=False,
        )
    kwargs = engine_kwargs(
        train,
        prepared,
        required=("data_dir", "output_dir"),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    # Resolve parameter for live monitor (name / epochs / monitor metric).
    orcai_parameter = kwargs.get("orcai_parameter")
    parameter: dict[str, Any] = {}
    if isinstance(orcai_parameter, dict):
        parameter = orcai_parameter
    elif orcai_parameter is not None:
        try:
            from orcai.io import read_json

            loaded = read_json(orcai_parameter)
            if isinstance(loaded, dict):
                parameter = loaded
        except (OSError, ValueError, TypeError, KeyError):
            # Optional train monitor metadata — keep empty parameter.
            parameter = {}
    if parameter:
        _reject_orcai_parameter(parameter, "train")
    model = parameter.get("model") if isinstance(parameter.get("model"), dict) else {}
    model_name = str(parameter.get("name") or "model").strip() or "model"
    model_dir = out / model_name
    epochs = int(model.get("epochs") or 30)
    # orcAI model.n_batch_train = batches per epoch (not samples).
    n_batch = int(model.get("n_batch_train") or 0)
    batches = n_batch if n_batch > 0 else None
    monitor = str(model.get("monitor") or "val_MBA")
    early_pat = int(
        model.get("EarlyStopping_patience") or model.get("early_stopping_patience") or 0
    )
    restore_fit = install_train_fit_hook(
        job_id=job_id,
        model_dir=model_dir,
        epochs=epochs,
        batches_per_epoch=batches,
        monitor_metric=monitor,
        early_stopping_patience=early_pat if early_pat > 0 else None,
    )
    try:
        created = _run_with_artifacts(output=out, call=lambda: train(**kwargs))
    finally:
        with contextlib.suppress(Exception):
            restore_fit()
        _cleanup_temp_orcai_parameter(kwargs.get("orcai_parameter"))
        _cleanup_temp_orcai_parameter(prepared.get("orcai_parameter"))
    return {
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out),
        "model_dir": str(model_dir),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }



def _calls_of(param: dict[str, Any] | None) -> list[str]:
    raw = (param or {}).get("calls")
    if not isinstance(raw, list):
        return []
    return [str(c).strip().upper() for c in raw if str(c).strip()]


def _check_test_class_layout(prepared: dict[str, Any], msgr: Any) -> None:
    """Refuse a test whose label width differs from the model's class count.

    orcAI scores label column *i* against model output *i*; a different count
    fails deep in Keras, a different order silently swaps per-class metrics.
    """
    model_dir = prepared.get("model_dir")
    data_dir = prepared.get("data_dir")
    if not model_dir or not data_dir:
        return
    model_calls = _calls_of(_read_json_dict(Path(str(model_dir)) / "orcai_parameter.json"))
    if not model_calls:
        return
    for split in ("test_dataset", ""):
        shapes = _read_json_dict(Path(str(data_dir)) / split / "dataset_shapes.json")
        labels = (shapes or {}).get("labels")
        if isinstance(labels, list) and labels and isinstance(labels[-1], int):
            if labels[-1] != len(model_calls):
                raise ValueError(
                    f"Dataset has {labels[-1]} classes, model has {len(model_calls)} "
                    f"({', '.join(model_calls)}). Rebuild tvt_data with the model's classes."
                )
            break
    project_param = prepared.get("orcai_parameter")
    if isinstance(project_param, str) and project_param:
        project_calls = _calls_of(_read_json_dict(Path(project_param)))
        if (
            project_calls
            and len(project_calls) == len(model_calls)
            and project_calls != model_calls
            and set(project_calls) == set(model_calls)
        ):
            msgr.warning(
                "Class order differs between the project parameter and the model: "
                f"project={project_calls} model={model_calls}. "
                "Per-class metrics follow the order the dataset was built with."
            )


def run_test(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.test_models import test_model

    prepared = _prepare_read_params(params)
    raw_model = prepared.get("model_dir")
    if raw_model:
        prepared["model_dir"] = str(resolve_trained_model_dir(raw_model))
    msgr = _messenger(
        job_id,
        params,
        f"Testing model {Path(str(prepared.get('model_dir', '') or '')).name}",
    )
    data_dir_raw = prepared.get("data_dir")
    unfiltered_dir = (
        Path(str(data_dir_raw)) / "test_unfiltered_dataset" if data_dir_raw else None
    )
    if unfiltered_dir is not None and not (unfiltered_dir / "dataset_shapes.json").is_file():
        # orcAI defaults test_unfiltered=True and crashes after the main test
        # when the unfiltered dataset was never built.
        if prepared.get("test_unfiltered", True):
            msgr.warning(
                f"{unfiltered_dir} not found — skipping the unfiltered test set."
            )
        prepared["test_unfiltered"] = False
    _check_test_class_layout(prepared, msgr)
    kwargs = engine_kwargs(
        test_model,
        prepared,
        required=("model_dir", "data_dir"),
        inject={"msgr": msgr},
    )
    model_dir = Path(str(kwargs["model_dir"])).resolve()
    out = kwargs.get("output_dir")
    explicit_out = out is not None and str(out) not in ("", "default")
    # When -o is omitted, orcAI writes under model_dir — collect only *new* files,
    # never the input model_dir itself.
    out_path = Path(str(out)).resolve() if explicit_out else model_dir
    before = snapshot_files(out_path if out_path.exists() else None)
    test_model(**kwargs)
    if explicit_out and out_path.exists() and out_path.is_file():
        created = collect_created(out_path)
    else:
        created = collect_created(
            before=before, root=out_path if out_path.exists() else None
        )
    # Belt-and-suspenders: never report the input model tree as a created artifact.
    model_resolved = str(model_dir.resolve())
    created = [p for p in created if p != model_resolved]
    return {
        "model_dir": str(model_dir),
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out_path) if explicit_out else None,
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }
