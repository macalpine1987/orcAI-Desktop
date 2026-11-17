"""Training pipeline board (FR-7.2): step state from the project directory."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_annotations import lacks_paired_annotation_txt
from orcai_desktop_sidecar.pipeline_constants import (
    STEPS_NEEDING_ANNOTATION_TXT,
    TRAIN_STEP_IDS,
)
from orcai_desktop_sidecar.pipeline_inspect_assemble import assemble_inspect_pipeline
from orcai_desktop_sidecar.pipeline_inspect_inventory import gather_pipeline_inventory
from orcai_desktop_sidecar.pipeline_param_fps import record_step_param_fingerprint
from orcai_desktop_sidecar.pipeline_readiness import (
    disk_readiness_state,
    estimate_pipeline_disk_needed,
    recordings_table_lamp,
    unlabeled_recordings_lamp,
)
from orcai_desktop_sidecar.project_registry import get_project
from orcai_desktop_sidecar.store import list_all_jobs
from orcai_desktop_sidecar.train_pipeline_cache import (
    PIPELINE_CACHE as _pipeline_cache,
    get_or_build_pipeline,
)

# Re-exports for runner / routes / tests / ek12 gate.
__all__ = (
    "TRAIN_STEP_IDS",
    "STEPS_NEEDING_ANNOTATION_TXT",
    "inspect_pipeline",
    "get_project_pipeline",
    "record_step_param_fingerprint",
    "lacks_paired_annotation_txt",
    "disk_readiness_state",
    "estimate_pipeline_disk_needed",
    "recordings_table_lamp",
    "unlabeled_recordings_lamp",
)


def _require_project(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    return project


def inspect_pipeline(
    project_dir: Path,
    *,
    orcai_name: str,
    jobs: list[dict[str, Any]] | None = None,
    accelerator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute eight-step disk state. No UI flags — only the project tree + jobs."""
    inv = gather_pipeline_inventory(project_dir, orcai_name=orcai_name)
    return assemble_inspect_pipeline(inv, jobs=jobs, accelerator=accelerator)


def get_project_pipeline(project_id: str, *, fresh: bool = False) -> dict[str, Any]:
    """Board snapshot. A hit younger than 4s is reused unless ``fresh`` is set.

    ``FileNotFoundError`` and a failed disk walk are not stored, so the next
    call tries again. A failed refresh leaves the previous snapshot in place.
    Concurrent misses share one build (PERF-02 singleflight).
    """

    def _build() -> dict[str, Any]:
        project = _require_project(project_id)
        project_dir = Path(project["path"]).resolve()
        jobs = list_all_jobs(project_dir=str(project_dir), limit=200)
        accelerator: dict[str, Any] = {}
        try:
            from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

            accelerator = get_cached_accelerator_summary()
        except Exception:  # noqa: BLE001 — probe is optional for the board
            accelerator = {}
        payload = inspect_pipeline(
            project_dir,
            orcai_name=str(project.get("orcai_name") or "orcai-v1"),
            jobs=jobs,
            accelerator=accelerator,
        )
        payload["project_id"] = project_id
        payload["orcai_name"] = project.get("orcai_name")
        return payload

    # Pass ``now`` from this module so tests can patch ``train_pipeline.time``.
    return get_or_build_pipeline(
        project_id,
        _build,
        fresh=fresh,
        now=time.monotonic(),
    )