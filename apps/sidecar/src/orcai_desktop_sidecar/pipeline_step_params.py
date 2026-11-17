"""Build run_params for each training pipeline step (board re-run)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_jobs import resolve_hps_parameter_path
from orcai_desktop_sidecar.project_registry import annotations_dir


@dataclass(frozen=True)
class StepParamsContext:
    """Explicit inputs for ``params_for_step`` (no free globals)."""

    project_dir: Path
    orcai_name: str
    parameter: dict[str, Any]
    param_str: str
    table_str: str
    combined_root: Path
    rec_data_dir: Path
    tvt_dir: Path
    snippet_file: Path
    hpsearch_dir: Path
    models_dir: Path
    want_unfiltered: bool
    finetune_lmf: str | None
    equivalences_path: Path | None


def params_for_step(ctx: StepParamsContext, step_id: str) -> dict[str, Any]:
    common = {"project_dir": str(ctx.project_dir), "orcai_parameter": ctx.param_str}
    if step_id == "create-spectrograms":
        return {
            **common,
            "recording_table_path": ctx.table_str,
            "output_dir": str(ctx.combined_root),
            "overwrite": True,
        }
    if step_id == "create-label-arrays":
        label_params: dict[str, Any] = {
            **common,
            "recording_table_path": ctx.table_str,
            "output_dir": str(ctx.combined_root),
            "base_dir_annotation": str(annotations_dir(ctx.project_dir)),
            "overwrite": True,
        }
        # QA-C1: board re-run must keep wizard synonyms (-ce), not identity-only.
        if ctx.equivalences_path is not None:
            label_params["call_equivalences"] = str(ctx.equivalences_path)
        return label_params
    if step_id == "create-snippet-table":
        return {
            **common,
            "recording_table_path": ctx.table_str,
            "recording_data_dir": str(
                ctx.combined_root if ctx.combined_root.is_dir() else ctx.rec_data_dir
            ),
            "output_dir": str(ctx.tvt_dir),
        }
    if step_id == "create-tvt-snippet-tables":
        tvt_snip: dict[str, Any] = {
            **common,
            "output_dir": str(ctx.tvt_dir),
            "snippet_table": str(ctx.snippet_file),
            "overwrite": True,
        }
        # QA-C2: mirror wizard testAfterTrain → -uts.
        if ctx.want_unfiltered:
            tvt_snip["create_unfiltered_test_snippets"] = True
        return tvt_snip
    if step_id == "create-tvt-data":
        return {**common, "tvt_dir": str(ctx.tvt_dir), "overwrite": True}
    if step_id == "hpsearch":
        hp_params: dict[str, Any] = {
            **common,
            "data_dir": str(ctx.tvt_dir),
            "output_dir": str(ctx.hpsearch_dir),
        }
        hps_path = resolve_hps_parameter_path(
            ctx.project_dir, ctx.parameter, ctx.orcai_name
        )
        if hps_path is not None:
            hp_params["hps_parameter"] = str(hps_path)
        return hp_params
    if step_id == "train":
        train_params: dict[str, Any] = {
            **common,
            "data_dir": str(ctx.tvt_dir),
            "output_dir": str(ctx.models_dir),
        }
        # QA-C3: board re-run of finetune keeps -lm / -lmf from last train job.
        if ctx.finetune_lmf:
            train_params["load_model"] = ctx.finetune_lmf
        # TRN-01 / QA-15: apply hpsearch winners only on explicit opt-in
        # (wizard plan sets apply_best_hyperparameters). Do not sticky-merge
        # from leftover best_hyperparameters.json on every board Train.
        return train_params
    # orcAI test loads ``model_dir/orcai_parameter.json`` (train writes under
    # ``models/<parameter.name>/``).
    model_name = str(ctx.parameter.get("name") or ctx.orcai_name or "").strip()
    test_model_dir = ctx.models_dir / model_name if model_name else ctx.models_dir
    test_params: dict[str, Any] = {
        "project_dir": str(ctx.project_dir),
        "model_dir": str(test_model_dir),
        "data_dir": str(ctx.tvt_dir),
    }
    # Always explicit: orcAI ``test_model`` defaults ``test_unfiltered`` to True.
    test_params["test_unfiltered"] = bool(ctx.want_unfiltered)
    return test_params
