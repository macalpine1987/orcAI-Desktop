"""Shared helpers for training pipeline adapters."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.engine_call import collect_created, snapshot_files
from orcai_desktop_sidecar.messenger import JobMessenger


def _messenger(job_id: str, params: dict[str, Any], title: str) -> JobMessenger:
    verbosity = int(params["verbosity"]) if "verbosity" in params else 2
    return JobMessenger(job_id, verbosity=verbosity, title=title)


def _reject_orcai_parameter(value: Any, kind: str) -> None:
    """Raise before orcAI when this step would crash on the parameter file."""
    from orcai_desktop_sidecar.parameter_guard import (
        load_parameter_document,
        reject_snippet_parameter,
        reject_spectrogram_parameter,
        reject_train_parameter,
    )

    document = load_parameter_document(value)
    if document is None:
        return
    if kind == "spectrogram":
        reject_spectrogram_parameter(document)
    elif kind == "snippets":
        reject_snippet_parameter(document)
    elif kind == "train":
        reject_train_parameter(document)



def _run_with_artifacts(
    *,
    output: Path,
    call: Any,
) -> list[str]:
    """Return only files created under ``output`` (never a pre-existing input root)."""
    before = snapshot_files(output if output.exists() else None)
    call()
    if not output.exists():
        return []
    if output.is_file():
        return collect_created(output)
    return collect_created(before=before, root=output)


def _read_json_dict(path: Path) -> dict[str, Any] | None:
    import json

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None
