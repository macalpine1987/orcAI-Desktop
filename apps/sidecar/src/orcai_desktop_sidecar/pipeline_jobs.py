"""Pipeline job / wizard-plan helpers."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_constants import (
    STATUS_BLOCKED,
    STATUS_DONE,
    STATUS_ERROR,
    STATUS_IDLE,
    STATUS_QUEUED,
    STATUS_RUNNING,
    STATUS_STALE,
    TRAIN_STEP_IDS,
    _BUSY,
)
from orcai_desktop_sidecar.project_registry import get_project
from orcai_desktop_sidecar.store import normalize_project_dir

def _resolve_call_equivalences_path(project_dir: Path) -> Path | None:
    """Wizard default ``call_equivalences.json`` (and common drop-in names)."""
    names = (
        "call_equivalences.json",
        "call_equivalence.json",
    )
    for name in names:
        path = project_dir / name
        if path.is_file():
            return path
    try:
        matches = sorted(
            (
                p
                for p in project_dir.glob("*call_equivalences*.json")
                if p.is_file() and not p.name.startswith(".")
            ),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        matches = []
    return matches[0] if matches else None


def _job_wants_unfiltered_test(job: dict[str, Any] | None) -> bool:
    if not job:
        return False
    params = job.get("params") if isinstance(job.get("params"), dict) else {}
    return bool(
        params.get("create_unfiltered_test_snippets")
        or params.get("test_unfiltered")
    )


def _want_unfiltered_test(
    tvt_dir: Path,
    latest: dict[str, dict[str, Any]],
) -> bool:
    """Mirror wizard ``testAfterTrain`` for board re-runs (-uts / -tu)."""
    if (tvt_dir / "test_unfiltered.csv.gz").is_file():
        return True
    if (tvt_dir / "test_unfiltered_dataset").exists():
        return True
    return _job_wants_unfiltered_test(
        latest.get("create-tvt-snippet-tables")
    ) or _job_wants_unfiltered_test(latest.get("test"))


def _resolve_finetune_load_model(
    latest: dict[str, dict[str, Any]],
) -> str | None:
    """Reuse ``-lmf`` from the latest project train job (wizard finetune)."""
    job = latest.get("train")
    if not job:
        return None
    params = job.get("params") if isinstance(job.get("params"), dict) else {}
    lmf = params.get("load_model_from")
    if isinstance(lmf, (str, Path)) and str(lmf).strip():
        return str(Path(str(lmf)).expanduser())
    lm = params.get("load_model")
    if isinstance(lm, str) and lm.strip() and lm.lower() not in ("true", "false", "1", "0"):
        return str(Path(lm).expanduser())
    return None


def resolve_hps_parameter_path(
    project_dir: Path,
    parameter: dict[str, Any],
    orcai_name: str,
) -> Path | None:
    """Prefer project HPS written by the wizard; else None (orcAI default -hp)."""
    names: list[str] = []
    model_name = str(parameter.get("name") or "").strip()
    if model_name:
        safe = re.sub(r"[^\w.\-]+", "_", model_name) or "model"
        names.append(f"{safe}_hps_parameter.json")
    orcai = str(orcai_name or "").strip()
    if orcai:
        safe = re.sub(r"[^\w.\-]+", "_", orcai) or "model"
        names.append(f"{safe}_hps_parameter.json")
    names.append("hps_parameter.json")
    seen: set[str] = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        path = project_dir / name
        if path.is_file():
            return path
    # Newest *_hps_parameter.json in the project root (wizard / manual drop-in).
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
    except OSError:
        matches = []
    return matches[0] if matches else None



# Compat alias
_resolve_hps_parameter_path = resolve_hps_parameter_path

def _hold_steps_after_failed(steps: list[dict[str, Any]]) -> None:
    """A failed step stays rerunnable. Later steps wait, except after hpsearch."""
    hold = False
    for step in steps:
        if hold and step["status"] not in (STATUS_RUNNING, STATUS_QUEUED):
            step["can_run"] = False
            step["run_block"] = "upstream_failed"
        if step["status"] == STATUS_ERROR and step["id"] != "hpsearch":
            hold = True


def _job_belongs(params: dict[str, Any], project_dir: Path) -> bool:
    want = normalize_project_dir(project_dir)
    if not want:
        return False
    if normalize_project_dir(params.get("project_dir")) == want:
        return True
    root = str(project_dir.resolve())
    for value in params.values():
        if not isinstance(value, str) or not value:
            continue
        candidate = normalize_project_dir(value)
        if candidate == want:
            return True
        if value == root or value.startswith(root + "/") or value.startswith(root + "\\"):
            return True
    return False


def _plan_id_of_params(params: dict[str, Any]) -> str | None:
    raw = params.get("plan_id")
    if not isinstance(raw, str):
        return None
    plan_id = raw.strip()
    return plan_id or None


def _active_wizard_plan(
    jobs: list[dict[str, Any]], project_dir: Path
) -> dict[str, Any] | None:
    """Best pending/running wizard plan for this project (Desktop ``plan_id`` tag)."""
    by_plan: dict[str, dict[str, Any]] = {}
    for job in jobs:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        plan_id = _plan_id_of_params(params)
        if not plan_id or not _job_belongs(params, project_dir):
            continue
        status = str(job.get("status") or "")
        if status not in ("pending", "running"):
            continue
        bucket = by_plan.setdefault(
            plan_id,
            {
                "plan_id": plan_id,
                "queued": 0,
                "running": 0,
                "updated_at": 0.0,
                "job_id": None,
            },
        )
        updated = float(job.get("updated_at") or 0)
        if updated >= float(bucket["updated_at"]):
            bucket["updated_at"] = updated
        if status == "running":
            bucket["running"] = int(bucket["running"]) + 1
            bucket["job_id"] = job.get("id")
        else:
            bucket["queued"] = int(bucket["queued"]) + 1
            if not bucket["job_id"]:
                bucket["job_id"] = job.get("id")
    if not by_plan:
        return None
    running = [p for p in by_plan.values() if int(p["running"]) > 0]
    candidates = running or list(by_plan.values())
    best = max(candidates, key=lambda p: float(p["updated_at"]))
    plan_id = str(best["plan_id"])
    # Full command set for this plan (any status) — used to gate optional hpsearch
    # on the board when the wizard launched without opt-in.
    # Jobs arrive newest-first (updated_at DESC). Collect the set, then emit
    # board/Home order — not discovery order.
    seen: set[str] = set()
    for job in jobs:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if _plan_id_of_params(params) != plan_id:
            continue
        if not _job_belongs(params, project_dir):
            continue
        command = str(job.get("command") or "").strip()
        if not command or command not in TRAIN_STEP_IDS:
            continue
        seen.add(command)
    commands = [step_id for step_id in TRAIN_STEP_IDS if step_id in seen]
    return {
        "plan_id": plan_id,
        "queued": int(best["queued"]),
        "running": int(best["running"]),
        "job_id": best["job_id"],
        "commands": commands,
        "includes_hpsearch": "hpsearch" in seen,
    }


def latest_jobs(jobs: list[dict[str, Any]], project_dir: Path) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for job in jobs:
        command = str(job.get("command") or "")
        if command not in TRAIN_STEP_IDS:
            continue
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if not _job_belongs(params, project_dir):
            continue
        prev = latest.get(command)
        if prev is None or float(job.get("updated_at") or 0) >= float(prev.get("updated_at") or 0):
            latest[command] = job
    return latest


_latest_jobs = latest_jobs


def step_payload(
    *,
    step_id: str,
    order: int,
    optional: bool,
    status: str,
    reason: str | None,
    artifact_path: str,
    artifact_label: str,
    file_count: int,
    size_bytes: int,
    updated_at: float | None,
    job: dict[str, Any] | None,
    run_params: dict[str, Any],
    artifact_kind: str = "files",
) -> dict[str, Any]:
    can_run = status not in _BUSY
    return {
        "id": step_id,
        "order": order,
        "optional": optional,
        "status": status,
        "reason": reason,
        "command": step_id,
        "artifact_path": artifact_path,
        "artifact_label": artifact_label,
        "file_count": file_count,
        "size_bytes": size_bytes,
        "updated_at": updated_at,
        "artifact_kind": artifact_kind,
        "job_id": job.get("id") if job else None,
        "job_status": job.get("status") if job else None,
        "progress": job.get("progress") if job else None,
        "error": job.get("error") if job and status == STATUS_ERROR else None,
        "can_run": can_run,
        "run_block": None,
        "run_params": run_params,
    }


_step_payload = step_payload

# Public names (private _ aliases kept for compat).
resolve_call_equivalences_path = _resolve_call_equivalences_path
want_unfiltered_test = _want_unfiltered_test
resolve_finetune_load_model = _resolve_finetune_load_model
hold_steps_after_failed = _hold_steps_after_failed
active_wizard_plan = _active_wizard_plan

