"""Pipeline board step assembly."""

from __future__ import annotations

from typing import Any

from orcai_desktop_sidecar.pipeline_artifacts import max_mtime
from orcai_desktop_sidecar.pipeline_inspect_inventory import PipelineInventory
from orcai_desktop_sidecar.pipeline_jobs import step_payload
from orcai_desktop_sidecar.pipeline_step_params import StepParamsContext, params_for_step
from orcai_desktop_sidecar.pipeline_step_status import StepStatusContext, resolve_step_status


def assemble_pipeline_steps(
    inv: PipelineInventory,
    *,
    status_ctx: StepStatusContext,
    params_ctx: StepParamsContext,
    latest: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Resolve eight step statuses and build board step payloads."""

    def params_for(step_id: str) -> dict[str, Any]:
        return params_for_step(params_ctx, step_id)

    def resolve_status(
        step_id: str,
        *,
        has_artifact: bool,
        artifact_mtime: float | None,
        blocked_reason: str | None,
        dep_mtime: float | None,
    ) -> tuple[str, str | None]:
        return resolve_step_status(
            status_ctx,
            step_id,
            has_artifact=has_artifact,
            artifact_mtime=artifact_mtime,
            blocked_reason=blocked_reason,
            dep_mtime=dep_mtime,
        )

    table_path = inv.table_path
    table_rows = inv.table_rows
    ann = inv.ann

    spec_blocked = None
    if table_path is None or table_rows <= 0:
        spec_blocked = "missing_recording_table" if table_path is None else "no_recordings"
    spec_status, spec_reason = resolve_status(
        "create-spectrograms",
        has_artifact=inv.spec_count > 0,
        artifact_mtime=inv.spec_mtime,
        blocked_reason=spec_blocked,
        dep_mtime=inv.table_mtime,
    )

    label_blocked = None
    if spec_blocked:
        label_blocked = spec_blocked
    elif ann["annotated_count"] <= 0 and ann["annotation_files"] <= 0:
        label_blocked = "no_annotations"
    label_status, label_reason = resolve_status(
        "create-label-arrays",
        has_artifact=inv.label_count > 0,
        artifact_mtime=inv.label_mtime,
        blocked_reason=label_blocked,
        dep_mtime=max_mtime(inv.table_mtime, ann["updated_at"]),
    )

    snippet_blocked = None
    if inv.spec_count <= 0:
        snippet_blocked = "missing_spectrograms"
    elif inv.label_count <= 0:
        snippet_blocked = "missing_label_arrays"
    snippet_status, snippet_reason = resolve_status(
        "create-snippet-table",
        has_artifact=inv.snippet_file.is_file(),
        artifact_mtime=inv.snippet_mtime,
        blocked_reason=snippet_blocked,
        dep_mtime=max_mtime(inv.spec_mtime, inv.label_mtime),
    )

    tvt_table_blocked = None if inv.snippet_file.is_file() else "missing_snippet_table"
    tvt_table_status, tvt_table_reason = resolve_status(
        "create-tvt-snippet-tables",
        has_artifact=inv.tvt_tables_ready,
        artifact_mtime=inv.tvt_table_mtime,
        blocked_reason=tvt_table_blocked,
        dep_mtime=inv.snippet_mtime,
    )

    tvt_data_blocked = None if inv.tvt_tables_ready else "missing_tvt_tables"
    tvt_data_status, tvt_data_reason = resolve_status(
        "create-tvt-data",
        has_artifact=inv.tvt_data_ready,
        artifact_mtime=inv.tvt_data_mtime,
        blocked_reason=tvt_data_blocked,
        dep_mtime=inv.tvt_table_mtime,
    )

    hp_blocked = None if inv.tvt_data_ready else "missing_tvt_data"
    hp_status, hp_reason = resolve_status(
        "hpsearch",
        has_artifact=inv.hp_files > 0,
        artifact_mtime=inv.hp_mtime,
        blocked_reason=hp_blocked,
        dep_mtime=inv.tvt_data_mtime,
    )

    train_blocked = None if inv.tvt_data_ready else "missing_tvt_data"
    train_status, train_reason = resolve_status(
        "train",
        has_artifact=len(inv.keras_files) > 0,
        artifact_mtime=inv.train_mtime,
        blocked_reason=train_blocked,
        dep_mtime=inv.tvt_data_mtime,
    )

    test_blocked = None if inv.keras_files else "missing_checkpoint"
    test_status, test_reason = resolve_status(
        "test",
        has_artifact=inv.test_count > 0,
        artifact_mtime=inv.test_mtime,
        blocked_reason=test_blocked,
        dep_mtime=inv.train_mtime,
    )

    return [
        step_payload(
            step_id="create-spectrograms",
            order=1,
            optional=False,
            status=spec_status,
            reason=spec_reason,
            artifact_path=str(inv.spec_path or inv.spec_root),
            artifact_label="spectrograms/",
            file_count=inv.spec_count,
            size_bytes=inv.spec_size,
            updated_at=inv.spec_mtime,
            job=latest.get("create-spectrograms"),
            run_params=params_for("create-spectrograms"),
            artifact_kind="recordings",
        ),
        step_payload(
            step_id="create-label-arrays",
            order=2,
            optional=False,
            status=label_status,
            reason=label_reason,
            artifact_path=str(inv.label_path or inv.label_root),
            artifact_label="label_arrays/",
            file_count=inv.label_count,
            size_bytes=inv.label_size,
            updated_at=inv.label_mtime,
            job=latest.get("create-label-arrays"),
            run_params=params_for("create-label-arrays"),
            artifact_kind="recordings",
        ),
        step_payload(
            step_id="create-snippet-table",
            order=3,
            optional=False,
            status=snippet_status,
            reason=snippet_reason,
            artifact_path=str(
                inv.snippet_file if inv.snippet_file.is_file() else inv.tvt_dir
            ),
            artifact_label="all_snippets.csv.gz",
            file_count=inv.snippet_rows if inv.snippet_rows is not None else inv.snippet_count,
            size_bytes=inv.snippet_size,
            updated_at=inv.snippet_mtime,
            job=latest.get("create-snippet-table"),
            run_params=params_for("create-snippet-table"),
            artifact_kind="rows",
        ),
        step_payload(
            step_id="create-tvt-snippet-tables",
            order=4,
            optional=False,
            status=tvt_table_status,
            reason=tvt_table_reason,
            artifact_path=str(inv.tvt_dir),
            artifact_label="tvt_data/",
            file_count=inv.tvt_table_count,
            size_bytes=inv.tvt_table_size,
            updated_at=inv.tvt_table_mtime,
            job=latest.get("create-tvt-snippet-tables"),
            run_params=params_for("create-tvt-snippet-tables"),
            artifact_kind="tables",
        ),
        step_payload(
            step_id="create-tvt-data",
            order=5,
            optional=False,
            status=tvt_data_status,
            reason=tvt_data_reason,
            artifact_path=str(inv.tvt_dir),
            artifact_label="tvt_data/",
            file_count=inv.tvt_data_count,
            size_bytes=inv.tvt_data_size,
            updated_at=inv.tvt_data_mtime,
            job=latest.get("create-tvt-data"),
            run_params=params_for("create-tvt-data"),
            artifact_kind="datasets",
        ),
        step_payload(
            step_id="hpsearch",
            order=6,
            optional=True,
            status=hp_status,
            reason=hp_reason,
            artifact_path=str(inv.hpsearch_dir),
            artifact_label="hpsearch/",
            file_count=inv.hp_files,
            size_bytes=inv.hp_size,
            updated_at=inv.hp_mtime,
            job=latest.get("hpsearch"),
            run_params=params_for("hpsearch"),
            artifact_kind="files",
        ),
        step_payload(
            step_id="train",
            order=7,
            optional=False,
            status=train_status,
            reason=train_reason,
            artifact_path=str(inv.models_dir),
            artifact_label="models/",
            file_count=inv.train_count,
            size_bytes=inv.train_size,
            updated_at=inv.train_mtime,
            job=latest.get("train"),
            run_params=params_for("train"),
            artifact_kind="models",
        ),
        step_payload(
            step_id="test",
            order=8,
            optional=False,
            status=test_status,
            reason=test_reason,
            artifact_path=str(
                inv.test_dir if inv.test_dir.exists() else inv.models_dir
            ),
            artifact_label="models/",
            file_count=inv.test_count,
            size_bytes=inv.test_size,
            updated_at=inv.test_mtime,
            job=latest.get("test"),
            run_params=params_for("test"),
            artifact_kind="files",
        ),
    ]


