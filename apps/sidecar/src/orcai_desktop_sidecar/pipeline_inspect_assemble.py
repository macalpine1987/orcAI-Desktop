"""Step assembly + readiness payload for ``inspect_pipeline``."""

from __future__ import annotations

from typing import Any

from orcai_desktop_sidecar.pipeline_artifacts import float_param, int_param
from orcai_desktop_sidecar.pipeline_inspect_inventory import PipelineInventory
from orcai_desktop_sidecar.pipeline_inspect_payload import build_pipeline_payload
from orcai_desktop_sidecar.pipeline_inspect_steps import assemble_pipeline_steps
from orcai_desktop_sidecar.pipeline_jobs import (
    active_wizard_plan,
    latest_jobs,
    resolve_call_equivalences_path,
    resolve_finetune_load_model,
    want_unfiltered_test,
)
from orcai_desktop_sidecar.pipeline_param_fps import load_param_fps, save_param_fps
from orcai_desktop_sidecar.pipeline_readiness import estimate_pipeline_disk_needed
from orcai_desktop_sidecar.pipeline_step_params import StepParamsContext
from orcai_desktop_sidecar.pipeline_step_status import StepStatusContext

def assemble_inspect_pipeline(
    inv: PipelineInventory,
    *,
    jobs: list[dict[str, Any]] | None = None,
    accelerator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Full board payload from a gathered inventory (used by ``inspect_pipeline``)."""
    project_dir = inv.project_dir
    parameter = inv.parameter
    model = inv.model
    snippets = inv.snippets
    param_path = inv.param_path
    table_path = inv.table_path
    table_rows = inv.table_rows

    param_fps = load_param_fps(project_dir)
    latest = latest_jobs(jobs or [], project_dir)
    active_plan = active_wizard_plan(jobs or [], project_dir)

    n_batch_train = int_param(model, "n_batch_train", "n_batch", default=0)
    n_batch_val = int_param(model, "n_batch_val", default=0)
    n_batch_test = int_param(model, "n_batch_test", default=0)
    batch_size = int_param(model, "batch_size", default=0)
    n_epochs = int_param(model, "epochs", "n_epochs", default=0)
    required_snippets = n_batch_train * batch_size if n_batch_train and batch_size else 0
    snippet_duration = float_param(snippets, "snippet_duration", default=4.0)
    snippets_per_sec = float_param(snippets, "snippets_per_sec", default=3.0)

    needed_bytes = estimate_pipeline_disk_needed(
        wav_bytes=inv.wav_bytes,
        table_rows=table_rows,
        spec_count=inv.spec_count,
        label_count=inv.label_count,
        tvt_data_ready=inv.tvt_data_ready,
        train_ready=inv.train_count > 0,
        required_snippets=required_snippets,
        snippet_rows=inv.snippet_rows,
        n_batch_train=n_batch_train,
        n_batch_val=n_batch_val,
        n_batch_test=n_batch_test,
        batch_size=batch_size,
        snippet_duration=snippet_duration,
        snippets_per_sec=snippets_per_sec,
    )

    table_str = str(table_path) if table_path else str(project_dir / "recording_table.csv")
    param_str = str(param_path)

    want_unfiltered = want_unfiltered_test(inv.tvt_dir, latest)
    finetune_lmf = resolve_finetune_load_model(latest)
    equivalences_path = resolve_call_equivalences_path(project_dir)

    params_ctx = StepParamsContext(
        project_dir=project_dir,
        orcai_name=inv.orcai_name,
        parameter=parameter,
        param_str=param_str,
        table_str=table_str,
        combined_root=inv.combined_root,
        rec_data_dir=inv.rec_data_dir,
        tvt_dir=inv.tvt_dir,
        snippet_file=inv.snippet_file,
        hpsearch_dir=inv.hpsearch_dir,
        models_dir=inv.models_dir,
        want_unfiltered=want_unfiltered,
        finetune_lmf=finetune_lmf,
        equivalences_path=equivalences_path,
    )

    status_ctx = StepStatusContext(
        parameter=parameter,
        param_fps=param_fps,
        param_mtime=inv.param_mtime,
        latest=latest,
    )

    steps = assemble_pipeline_steps(
        inv,
        status_ctx=status_ctx,
        params_ctx=params_ctx,
        latest=latest,
    )

    if status_ctx.param_fps_dirty:
        save_param_fps(project_dir, param_fps)

    return build_pipeline_payload(
        inv,
        steps=steps,
        active_plan=active_plan,
        accelerator=accelerator,
        n_batch_train=n_batch_train,
        n_batch_val=n_batch_val,
        n_batch_test=n_batch_test,
        batch_size=batch_size,
        n_epochs=n_epochs,
        needed_bytes=needed_bytes,
    )
