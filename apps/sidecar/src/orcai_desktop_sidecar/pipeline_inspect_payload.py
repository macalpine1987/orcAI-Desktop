"""Pipeline board readiness payload."""

from __future__ import annotations

from typing import Any

from orcai_desktop_sidecar.pipeline_annotations import (
    annotations_readiness,
    block_steps_without_annotations,
    recordings_readiness,
)
from orcai_desktop_sidecar.pipeline_artifacts import float_param, int_param
from orcai_desktop_sidecar.pipeline_inspect_inventory import PipelineInventory
from orcai_desktop_sidecar.pipeline_jobs import hold_steps_after_failed
from orcai_desktop_sidecar.pipeline_readiness import (
    disk_readiness_state,
    unlabeled_recordings_lamp,
)

def build_pipeline_payload(
    inv: PipelineInventory,
    *,
    steps: list[dict[str, Any]],
    active_plan: dict[str, Any] | None,
    accelerator: dict[str, Any] | None,
    n_batch_train: int,
    n_batch_val: int,
    n_batch_test: int,
    batch_size: int,
    n_epochs: int,
    needed_bytes: int,
) -> dict[str, Any]:
    """Readiness lamps + summary parameters for the board response."""
    project_dir = inv.project_dir
    parameter = inv.parameter
    spectrogram = inv.spectrogram
    snippets = inv.snippets
    calls = inv.calls
    param_path = inv.param_path
    table_path = inv.table_path
    table_rows = inv.table_rows
    ann = inv.ann

    accel = accelerator or {}
    gpu_available = bool(accel.get("gpu_available"))
    backend = str(accel.get("gpu_backend") or accel.get("accelerator_hint") or "cpu")
    active_device = str(accel.get("active_compute_device") or "").strip().lower()
    # Readiness lamp: green for CPU / no session; blue only when the *session* is GPU.
    # Do not infer session from probe-only gpu_available (Metal present ≠ active GPU).
    accel_state = "info" if active_device == "gpu" else "ok"

    freq = spectrogram.get("freq_range") if isinstance(spectrogram.get("freq_range"), list) else [0, 16000]
    freq_lo = int(freq[0]) if freq else 0
    freq_hi = int(freq[1]) if freq and len(freq) > 1 else 16000

    disk_state = disk_readiness_state(
        free_bytes=inv.free_bytes,
        needed_bytes=needed_bytes,
        measured=inv.disk_measured,
    )

    unlabeled_state = unlabeled_recordings_lamp(
        ann["wav_count"],
        ann["paired_txt_count"],
    )
    required_snippets = n_batch_train * batch_size if n_batch_train and batch_size else 0
    # Match orcAI create-tvt-snippet-tables: each split's n_batch x batch_size must
    # fit filtered inventory or upstream raises ValueError. Desktop may still
    # clamp at job start; the lamp warns that the parameter request exceeds inventory.
    # Report the worst shortfall so the lamp/sub/banner stay consistent.
    snippet_state = "ok"
    report_actual: int | None = inv.train_snippet_rows
    report_required = (
        n_batch_train * batch_size if n_batch_train and batch_size else 0
    )
    report_n_batch = n_batch_train
    report_split = "train"
    if batch_size and inv.snippet_file.is_file():
        worst_deficit = -1
        for split, n_batch in (
            ("train", n_batch_train),
            ("val", n_batch_val),
            ("test", n_batch_test),
        ):
            if not n_batch:
                continue
            required = n_batch * batch_size
            actual = int(inv.snippet_by_type.get(split) or 0)
            if actual < required:
                deficit = required - actual
                if deficit > worst_deficit:
                    worst_deficit = deficit
                    report_actual = actual
                    report_required = required
                    report_n_batch = n_batch
                    report_split = split
        if worst_deficit >= 0:
            snippet_state = "warn"
    elif required_snippets and (inv.train_snippet_rows or 0) < required_snippets:
        snippet_state = "off"

    block_steps_without_annotations(steps, ann)
    hold_steps_after_failed(steps)

    return {
        "project_id": None,
        "project_dir": str(project_dir),
        "parameter_path": str(param_path),
        "parameter_filename": param_path.name,
        "parameter_exists": param_path.is_file(),
        "active_plan": active_plan,
        "steps": steps,
        "readiness": {
            "recordings": recordings_readiness(
                project_dir,
                table_path=table_path,
                table_rows=table_rows,
            ),
            "annotations": annotations_readiness(ann),
            "unlabeled": {
                "state": unlabeled_state,
                "count": ann["unlabeled_count"],
            },
            "classes": {
                "state": "ok" if calls else "off",
                "found": len(calls),
                "names": calls,
                "source": "parameters" if calls else "none",
            },
            "snippets": {
                "state": snippet_state,
                "actual": report_actual,
                "required": report_required,
                "n_batch": report_n_batch,
                "batch_size": batch_size,
                "split": report_split,
            },
            "disk": {
                "state": disk_state,
                "free_bytes": inv.free_bytes,
                "needed_bytes": needed_bytes,
            },
            "accelerator": {
                "state": accel_state,
                "gpu_available": gpu_available,
                "backend": backend,
                "devices": accel.get("gpu_devices") or [],
                "hint": accel.get("accelerator_hint"),
                "active_compute_device": active_device or "cpu",
            },
        },
        "parameters": {
            "architecture": str(parameter.get("architecture") or "—"),
            "sampling_rate": int_param(spectrogram, "sampling_rate", default=48_000),
            "nfft": int_param(spectrogram, "nfft", default=512),
            "n_overlap": int_param(spectrogram, "n_overlap", default=256),
            "freq_low": freq_lo,
            "freq_high": freq_hi,
            "snippet_duration": float_param(snippets, "snippet_duration", default=4),
            "snippets_per_sec": float_param(snippets, "snippets_per_sec", default=3),
            "split_train": float_param(snippets, "train", default=0.8),
            "split_val": float_param(snippets, "val", default=0.1),
            "split_test": float_param(snippets, "test", default=0.1),
            "epochs": n_epochs,
            "batch_size": batch_size,
            "n_batch_train": n_batch_train,
        },
    }


