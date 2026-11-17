"""Predict output-path resolution and call-duration limits."""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path
from typing import Any

PREDICT_SELECTION_DIRNAME = ".orcai-desktop"
PREDICT_SELECTION_CSV_NAME = "predict_selection.csv"


def predict_selection_csv_path(project_dir: str | Path) -> Path:
    """Stable CSV sidecar writes for a subset of recording_table.csv."""
    return Path(project_dir).resolve() / PREDICT_SELECTION_DIRNAME / PREDICT_SELECTION_CSV_NAME


def _default_call_duration_limits_path() -> str:
    return str(files("orcai.defaults").joinpath("default_call_duration_limits.json"))


def resolve_call_duration_limits(params: dict[str, Any]) -> str | None:
    """
    Resolve call-duration limits when the job asks for them.

    If the key is absent, or value is null/empty: return None so orcAI keeps
    its own default (predict: no duration filter; filter-predictions: package
    default). Explicit path is passed through. Sentinels ``project`` / ``auto``
    resolve the newest ``*_call_duration_limits.json`` under ``project_dir``,
    then the bundled package default.
    """
    if "call_duration_limits" not in params:
        return None
    explicit = params.get("call_duration_limits")
    if explicit in (None, ""):
        # PRED-01 / PRED-02: null ≠ "use project/package file"
        return None

    token = str(explicit).strip()
    if token in ("project", "auto"):
        project_dir = params.get("project_dir")
        if project_dir:
            root = Path(str(project_dir))
            if root.is_dir():
                for path in sorted(root.glob("*_call_duration_limits.json")):
                    if path.is_file():
                        return str(path.resolve())
        return _default_call_duration_limits_path()
    if token == "default":
        return _default_call_duration_limits_path()
    return token


def _model_parameter_name(model_dir: Path) -> str:
    from orcai.io import read_json

    param_path = model_dir / "orcai_parameter.json"
    if param_path.is_file():
        return str(read_json(param_path)["name"])
    return model_dir.name


def resolve_predict_output_path(
    recording_path: str | Path,
    channel: int,
    model_dir: Path,
    output_path: str | Path = "default",
) -> Path:
    recording_path = Path(recording_path)
    if str(output_path) != "default":
        return Path(output_path).resolve()
    model_name = _model_parameter_name(model_dir)
    filename = f"{recording_path.stem}_c{channel}_{model_name}_predicted.txt"
    return recording_path.with_name(filename).resolve()


def resolve_csv_batch_label_path(
    *,
    wav_path: Path | None,
    stem: str,
    channel: int,
    model_dir: Path,
    output_param: Any,
) -> Path | None:
    """Mirror orcAI CSV naming: custom -o is a directory of per-recording files."""
    if str(output_param) != "default":
        return Path(str(output_param)).joinpath(
            f"{stem}_{model_dir.stem}_predicted.txt"
        ).resolve()
    if wav_path is None:
        return None
    return resolve_predict_output_path(wav_path, channel, model_dir, "default")


def resolve_filtered_output_path(predicted_labels_path: str | Path) -> Path:
    path = Path(predicted_labels_path)
    return path.with_name(f"{path.stem}_filtered.txt").resolve()


def _resolve_model_dir_if_requested(params: dict[str, Any]) -> Path | None:
    """Only resolve when the job provided model_dir or model; else orcAI default."""
    if params.get("model_dir"):
        return Path(str(params["model_dir"]))
    if params.get("model"):
        return Path(str(files("orcai.models").joinpath(str(params["model"]))))
    return None
