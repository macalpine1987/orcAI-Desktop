"""Cancel-time cleanup of partial orcAI artifacts (NFR-6)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.predict import (
    resolve_filtered_output_path,
    resolve_predict_output_path,
)

_log = logging.getLogger(__name__)

# File systems with coarse mtime (HFS+, FAT, SMB) round to whole seconds.
_MTIME_SLACK_SEC = 1.0


def _unlink_if_file(path: Path, since: float | None = None) -> str | None:
    if not path.is_file():
        return None
    if since is not None:
        try:
            if path.stat().st_mtime < since - _MTIME_SLACK_SEC:
                return None
        except OSError:
            return None
    path.unlink(missing_ok=True)
    return str(path.resolve())


def cleanup_partial_artifacts(
    command: str,
    params: dict[str, Any],
    *,
    since: float | None = None,
) -> list[str]:
    """
    Remove known partial outputs after cancel, or mark directories incomplete.

    Callers must invoke this *after* the worker has been stopped (or cooperative
    cancel has been requested and the writer has settled), so unlinked files are
    not rewritten by a still-running job.

    ``since`` is the job start time: files last modified before it belong to an
    earlier run (or the user) and are kept.
    """
    removed: list[str] = []
    try:
        if command == "predict":
            removed.extend(_cleanup_predict(params, since))
        elif command == "filter-predictions":
            removed.extend(_cleanup_filter(params, since))
        elif command == "create-recording-table":
            removed.extend(_cleanup_recording_table(params, since))
        elif command == "init":
            removed.extend(_cleanup_init(params, since))
        elif command in (
            "create-spectrograms",
            "create-label-arrays",
            "create-tvt-data",
            "create-tvt-snippet-tables",
            "hpsearch",
            "train",
        ):
            removed.extend(_mark_incomplete(command, params))
        elif command == "test":
            removed.extend(_cleanup_test(params))
        elif command == "create-snippet-table":
            out = params.get("output_path") or params.get("output_dir")
            if out and str(out) != "default":
                gone = _unlink_if_file(Path(out), since)
                if gone:
                    removed.append(gone)
    except Exception:  # noqa: BLE001 — cancel cleanup must not fail the cancel path
        _log.exception("cancel cleanup failed for command=%s", command)
    return removed


def _predict_model_dir(params: dict[str, Any]) -> Path:
    from importlib.resources import files

    if params.get("model_dir"):
        return Path(params["model_dir"])
    model_name = params.get("model", "orcai-isl-v1")
    return Path(str(files("orcai.models").joinpath(model_name)))


def _cleanup_predict(params: dict[str, Any], since: float | None) -> list[str]:
    recording_path = params.get("recording_path")
    if not recording_path:
        return []
    path = Path(str(recording_path))
    if path.suffix.lower() == ".csv":
        return _cleanup_predict_csv(params, path, since)
    channel = int(params.get("channel", 1))
    output_param = params.get("output_path", "default")
    model_dir = _predict_model_dir(params)
    label = resolve_predict_output_path(path, channel, model_dir, output_param)
    gone = _unlink_if_file(label, since)
    return [gone] if gone else []


def _cleanup_predict_csv(
    params: dict[str, Any],
    table_path: Path,
    since: float | None,
) -> list[str]:
    """CSV batch writes one label per recording, not a file named after the table."""
    from orcai_desktop_sidecar.adapters.predict import _collect_csv_batch_files

    if not table_path.is_file():
        return []
    model_dir = _predict_model_dir(params)
    output_param = params.get("output_path", "default")
    project_dir = params.get("project_dir")
    removed: list[str] = []
    try:
        rows = _collect_csv_batch_files(
            table_path,
            model_dir=model_dir,
            output_param=output_param,
            project_dir=str(project_dir) if project_dir else None,
        )
    except OSError:
        return []
    for row in rows:
        label = row.get("label_path")
        if not label:
            continue
        gone = _unlink_if_file(Path(str(label)), since)
        if gone:
            removed.append(gone)
    return removed


def _cleanup_filter(params: dict[str, Any], since: float | None) -> list[str]:
    predicted = params.get("predicted_labels") or params.get("predicted_labels_path")
    if not predicted:
        return []
    output_param = params.get("output_file", "default")
    if str(output_param) == "default":
        label = resolve_filtered_output_path(predicted)
    else:
        label = Path(output_param).resolve()
    gone = _unlink_if_file(label, since)
    return [gone] if gone else []


def _cleanup_recording_table(params: dict[str, Any], since: float | None) -> list[str]:
    out = params.get("output_path")
    if out and str(out) != "default":
        path = Path(str(out))
    else:
        base = params.get("base_dir_recording")
        if not base:
            return []
        path = Path(str(base)) / "recording_table.csv"
    gone = _unlink_if_file(path, since)
    # A killed worker cannot run its own ``finally``: bring the pre-sync CSV back.
    from orcai_desktop_sidecar.recording_table_params import (
        restore_recording_table_backup,
    )

    if not path.exists():
        restore_recording_table_backup(path)
    return [gone] if gone else []


def _cleanup_init(params: dict[str, Any], since: float | None) -> list[str]:
    """Mark project incomplete and remove the parameter JSON if partially written."""
    project_dir = params.get("project_dir")
    if not project_dir:
        return []
    root = Path(str(project_dir))
    removed: list[str] = []
    if root.exists():
        removed.extend(_write_incomplete_marker(root, "init"))
    project_name = params.get("project_name")
    if project_name:
        param = root / f"{project_name}_orcai_parameter.json"
        gone = _unlink_if_file(param, since)
        if gone:
            removed.append(gone)
    return list(dict.fromkeys(removed))


def _cleanup_test(params: dict[str, Any]) -> list[str]:
    """
    Mark the test output root incomplete.

    With ``-o`` / output_dir: mark that directory.
    Without it, orcAI writes under model_dir — mark model_dir so partial metrics
    are not treated as a finished evaluation (NFR-6).
    """
    out = params.get("output_dir")
    if out and str(out) not in ("", "default"):
        root = Path(str(out))
    else:
        model_dir = params.get("model_dir")
        if not model_dir:
            return []
        root = Path(str(model_dir))
    if not root.exists():
        return []
    return _write_incomplete_marker(root, "test")


def _mark_incomplete(command: str, params: dict[str, Any]) -> list[str]:
    out = (
        params.get("output_dir")
        or params.get("tvt_dir")
        or params.get("tvt_snippet_tables_dir")
    )
    if not out:
        return []
    root = Path(str(out))
    if not root.exists():
        return []
    return _write_incomplete_marker(root, command)


def _write_incomplete_marker(root: Path, command: str) -> list[str]:
    marker = root / f".orcai-desktop-incomplete-{command}"
    marker.write_text(
        "Job cancelled before completion. Do not treat this directory as ready.\n",
        encoding="utf-8",
    )
    return [str(marker.resolve())]
