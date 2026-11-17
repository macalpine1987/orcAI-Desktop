"""Snippet / TVT / hpsearch adapters (orcAI steps)."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.training_common import (
    _messenger,
    _reject_orcai_parameter,
    _run_with_artifacts,
)
from orcai_desktop_sidecar.adapters.training_params import (
    abs_str,
    cleanup_temp_orcai_parameter as _cleanup_temp_orcai_parameter,
    normalize_params as _normalize_params,
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


def run_create_snippet_table(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_snippet_table

    prepared = _normalize_params(params)
    if "output_path" in prepared and "output_dir" not in prepared:
        prepared["output_dir"] = prepared.pop("output_path")
    msgr = _messenger(job_id, params, "Creating snippet table")
    kwargs = engine_kwargs(
        create_snippet_table,
        prepared,
        required=("recording_table_path", "recording_data_dir"),
        inject={"msgr": msgr},
    )
    _reject_orcai_parameter(kwargs.get("orcai_parameter"), "snippets")
    out = kwargs.get("output_dir")
    out_path = Path(str(out)).resolve() if out else None
    before = snapshot_files(out_path)
    create_snippet_table(**kwargs)
    created = collect_created(
        out_path if out_path and out_path.exists() else None,
        before=before,
        root=out_path,
    )
    return {
        "recording_table_path": abs_str(kwargs["recording_table_path"]),
        "recording_data_dir": abs_str(kwargs["recording_data_dir"]),
        "output_dir": str(out_path) if out_path else None,
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_create_tvt_snippet_tables(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_tvt_snippet_tables

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating TVT snippet tables")

    out_hint = prepared.get("output_dir")
    st = prepared.get("snippet_table")
    snippet_path: Path | None = None
    if isinstance(st, (str, Path)) and str(st).strip():
        snippet_path = Path(str(st)).expanduser()
    elif out_hint:
        candidate = Path(str(out_hint)).expanduser() / "all_snippets.csv.gz"
        if candidate.is_file():
            snippet_path = candidate

    if "orcai_parameter" in prepared:
        prepared["orcai_parameter"] = _clamp_n_batches_to_snippets(
            prepared.get("orcai_parameter"),
            snippet_path,
            msgr=msgr,
        )

    kwargs = engine_kwargs(
        create_tvt_snippet_tables,
        prepared,
        required=("output_dir",),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    try:
        created = _run_with_artifacts(
            output=out, call=lambda: create_tvt_snippet_tables(**kwargs)
        )
    finally:
        _cleanup_temp_orcai_parameter(kwargs.get("orcai_parameter"))
        _cleanup_temp_orcai_parameter(prepared.get("orcai_parameter"))
    return {
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def _drop_stale_dataset_shards(tvt_dir: Path) -> None:
    """Remove old ``data_*.tfrecord`` shards before orcAI rewrites a dataset.

    orcAI reuses the folder and writes shards from index 0, but loads every
    ``data_*.tfrecord`` it finds, so a smaller rebuild would mix in old shards.
    """
    if not tvt_dir.is_dir():
        return
    for snippets in tvt_dir.glob("*.csv.gz"):
        itype = snippets.name[: -len(".csv.gz")]
        dataset_dir = tvt_dir / f"{itype}_dataset"
        if not dataset_dir.is_dir():
            continue
        for shard in dataset_dir.glob("data_*.tfrecord"):
            shard.unlink(missing_ok=True)


def run_create_tvt_data(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_tvt_data

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating TVT datasets")
    kwargs = engine_kwargs(
        create_tvt_data,
        prepared,
        required=("tvt_dir",),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["tvt_dir"])).resolve()
    if kwargs.get("overwrite"):
        _drop_stale_dataset_shards(out)
    import orcai.snippets as orcai_snippets

    # orcAI appends "test_unfiltered" to the module-level DATA_TYPES list.
    data_types_before = list(orcai_snippets.DATA_TYPES)
    try:
        created = _run_with_artifacts(
            output=out, call=lambda: create_tvt_data(**kwargs)
        )
    finally:
        orcai_snippets.DATA_TYPES[:] = data_types_before
    return {
        "tvt_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_hpsearch(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.hpsearch import hyperparameter_search

    prepared = _prepare_read_params(params)
    msgr = _messenger(job_id, params, "Hyperparameter search")
    kwargs = engine_kwargs(
        hyperparameter_search,
        prepared,
        required=("data_dir", "output_dir"),
        inject={"msgr": msgr},
    )
    # orcAI ``hyperparameter_search`` calls ``data_dir.joinpath`` without coercing
    # Path (unlike ``train``). Job params are strings from the Desktop UI.
    kwargs["data_dir"] = Path(str(kwargs["data_dir"])).expanduser().resolve()
    kwargs["output_dir"] = Path(str(kwargs["output_dir"])).expanduser().resolve()
    if kwargs.get("hps_parameter") is not None:
        kwargs["hps_parameter"] = (
            Path(str(kwargs["hps_parameter"])).expanduser().resolve()
        )
    out = kwargs["output_dir"]
    if prepared.get("overwrite"):
        logs = Path(out) / "hps_logs"
        if logs.is_dir():
            shutil.rmtree(logs, ignore_errors=True)
        best = Path(out) / "best_hyperparameters.json"
        best.unlink(missing_ok=True)
    created = _run_with_artifacts(
        output=out, call=lambda: hyperparameter_search(**kwargs)
    )
    return {
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }
