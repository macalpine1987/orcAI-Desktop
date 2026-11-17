"""Resolve per-step board status from jobs + artifacts + param fingerprints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from orcai_desktop_sidecar.pipeline_artifacts import newer
from orcai_desktop_sidecar.pipeline_constants import (
    STATUS_BLOCKED,
    STATUS_DONE,
    STATUS_ERROR,
    STATUS_IDLE,
    STATUS_QUEUED,
    STATUS_RUNNING,
    STATUS_STALE,
)
from orcai_desktop_sidecar.pipeline_param_fps import (
    _params_make_step_stale,
    _stale_param_reason,
)


@dataclass
class StepStatusContext:
    """Mutable fingerprint bookkeeping shared across status resolves."""

    parameter: dict[str, Any]
    param_fps: dict[str, Any]
    param_mtime: float | None
    latest: dict[str, Any]
    param_fps_dirty: bool = False


def resolve_step_status(
    ctx: StepStatusContext,
    step_id: str,
    *,
    has_artifact: bool,
    artifact_mtime: float | None,
    blocked_reason: str | None,
    dep_mtime: float | None,
) -> tuple[str, str | None]:
    job = ctx.latest.get(step_id)
    job_status = str(job.get("status") or "") if job else ""
    if job_status == "running":
        return STATUS_RUNNING, None
    if job_status == "pending":
        return STATUS_QUEUED, None
    if job_status == "failed":
        return STATUS_ERROR, "job_failed"
    if blocked_reason and not has_artifact:
        return STATUS_BLOCKED, blocked_reason
    if not has_artifact:
        return STATUS_IDLE, None
    params_stale, pin_fp = _params_make_step_stale(
        step_id,
        parameter=ctx.parameter,
        fps=ctx.param_fps,
        artifact_mtime=artifact_mtime,
        param_mtime=ctx.param_mtime,
    )
    if params_stale:
        return STATUS_STALE, _stale_param_reason(step_id)
    if newer(dep_mtime, artifact_mtime):
        return STATUS_STALE, "upstream_changed"
    if pin_fp is not None and ctx.param_fps.get(step_id) != pin_fp:
        ctx.param_fps[step_id] = pin_fp
        ctx.param_fps_dirty = True
    return STATUS_DONE, None
