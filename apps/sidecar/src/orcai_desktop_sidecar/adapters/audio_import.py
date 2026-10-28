"""Background import of WAV files (copy) into project recordings."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.job_cancel import JobCancelled
from orcai_desktop_sidecar.job_cancel import check as check_cancelled
from orcai_desktop_sidecar.jobs import append_log, set_progress
from orcai_desktop_sidecar.project_registry import import_audio_path


def run_import_audio(
    job_id: str,
    params: dict[str, Any],
    *,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    project_id = params.get("project_id")
    paths = params.get("paths")
    if not project_id or not isinstance(project_id, str):
        raise ValueError("project_id is required")
    if not paths or not isinstance(paths, list):
        raise ValueError("paths must be a non-empty list")

    def _log(line: str) -> None:
        if log:
            log(line)
        else:
            append_log(job_id, line)

    # Same order as sync import_recordings (drag-drop / multi-select often unsorted).
    ordered = sorted(paths, key=lambda p: Path(str(p)).name.casefold())
    imported: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []
    total = len(ordered)
    set_progress(job_id, 0.0)
    _log(f"Importing {total} file(s) into project {project_id}")

    for index, raw in enumerate(ordered, start=1):
        try:
            check_cancelled(job_id)
        except JobCancelled:
            set_progress(job_id, (index - 1) / total if total else 0.0)
            return {
                "imported": imported,
                "failed": failed,
                "count": len(imported),
                "project_id": project_id,
                "cancelled": True,
            }
        src = Path(str(raw)).expanduser().resolve()
        _log(f"[{index}/{total}] {src.name}")
        set_progress(job_id, max(0.0, (index - 1) / total))

        def step(message: str) -> None:
            _log(f"  {message}")

        try:
            row = import_audio_path(project_id, src, log=step)
            imported.append(row)
            _log(f"  OK → {row.get('name', src.name)}")
        except Exception as exc:  # noqa: BLE001 — per-file import; error logged + returned in failed[]
            err = str(exc)
            failed.append({"path": str(src), "error": err})
            _log(f"  Failed: {err}")

        set_progress(job_id, index / total)

    if not imported and failed:
        first = failed[0]["error"]
        raise ValueError(
            f"All {len(failed)} file(s) failed to import. First error: {first}"
        )

    if failed:
        _log(
            f"Done with errors: {len(imported)} ok, {len(failed)} failed"
        )
    else:
        _log(f"Done: {len(imported)} WAV file(s)")

    set_progress(job_id, 1.0)
    return {
        "imported": imported,
        "failed": failed,
        "count": len(imported),
        "project_id": project_id,
    }
