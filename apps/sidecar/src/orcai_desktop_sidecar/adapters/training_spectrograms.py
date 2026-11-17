"""Create-spectrograms adapter (orcAI step)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.training_common import (
    _messenger,
    _read_json_dict,
    _reject_orcai_parameter,
    _run_with_artifacts,
)
from orcai_desktop_sidecar.adapters.training_params import (
    abs_str,
    normalize_params as _normalize_params,
)
from orcai_desktop_sidecar.engine_call import cli_params_from_engine, engine_kwargs


def _load_calls_for_spectrogram_preflight(orcai_parameter: Any) -> list[str]:
    """Resolve ``calls`` the same way orcAI create_spectrograms does for -enp.

    Uses stdlib JSON (not ``orcai.io``) so preflight does not import TensorFlow.
    """
    if orcai_parameter is None:
        from importlib.resources import files

        orcai_parameter = str(
            files("orcai.defaults").joinpath("default_orcai_parameter.json")
        )
    if isinstance(orcai_parameter, dict):
        doc = orcai_parameter
    elif isinstance(orcai_parameter, (str, Path)):
        doc = _read_json_dict(Path(str(orcai_parameter)).expanduser())
    else:
        return []
    raw = doc.get("calls") if isinstance(doc, dict) else None
    if not isinstance(raw, list):
        return []
    return [str(x) for x in raw]


def count_spectrogram_eligible_rows(
    recording_table_path: str | Path,
    *,
    orcai_parameter: Any = None,
    include_not_annotated: bool = False,
    include_no_possible_annotations: bool = False,
) -> dict[str, int]:
    """Mirror orcAI create_spectrograms row filters (before overwrite skip).

    Used so Desktop does not report success for «Creating 0 spectrograms»
    when every row was dropped for missing annotations / possible classes.
    """
    import pandas as pd

    table = pd.read_csv(recording_table_path)
    total = len(table)
    if total == 0:
        return {
            "total": 0,
            "after_annotation_filter": 0,
            "eligible": 0,
            "excluded_not_annotated": 0,
            "excluded_no_possible": 0,
        }

    working = table
    excluded_not_annotated = 0
    if not include_not_annotated and "base_dir_annotation" in working.columns:
        not_annotated = working["base_dir_annotation"].isna()
        excluded_not_annotated = int(not_annotated.sum())
        working = working[~not_annotated]
    after_ann = len(working)

    excluded_no_possible = 0
    if not include_no_possible_annotations and after_ann > 0:
        calls = _load_calls_for_spectrogram_preflight(orcai_parameter)
        present = [c for c in calls if c in working.columns]
        if present:
            included = working[present].apply(lambda row: bool(row.any()), axis=1)
            excluded_no_possible = int((~included).sum())
            working = working[included]

    return {
        "total": total,
        "after_annotation_filter": after_ann,
        "eligible": len(working),
        "excluded_not_annotated": excluded_not_annotated,
        "excluded_no_possible": excluded_no_possible,
    }


def reject_empty_spectrogram_selection(
    counts: dict[str, int],
    *,
    include_not_annotated: bool,
    include_no_possible_annotations: bool,
) -> None:
    """Fail closed when orcAI would create zero spectrograms due to -en/-enp filters."""
    total = int(counts.get("total") or 0)
    eligible = int(counts.get("eligible") or 0)
    if total <= 0 or eligible > 0:
        return
    excluded_na = int(counts.get("excluded_not_annotated") or 0)
    excluded_np = int(counts.get("excluded_no_possible") or 0)
    hints: list[str] = []
    if excluded_na and not include_not_annotated:
        hints.append("include_not_annotated (-en) to include rows without annotations")
    if excluded_np and not include_no_possible_annotations:
        hints.append(
            "include_no_possible_annotations (-enp) to include rows with no possible classes"
        )
    hint = (
        " Or set " + "; or ".join(hints) + "."
        if hints
        else " Add paired annotation .txt files or set -en / -enp."
    )
    raise ValueError(
        f"No recordings left for create-spectrograms "
        f"({total} in table; excluded not annotated: {excluded_na}; "
        f"excluded no possible classes: {excluded_np})."
        f"{hint}"
    )


def run_create_spectrograms(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.spectrogram import create_spectrograms

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating spectrograms")
    kwargs = engine_kwargs(
        create_spectrograms,
        prepared,
        required=("recording_table_path", "output_dir"),
        inject={"msgr": msgr},
    )
    _reject_orcai_parameter(kwargs.get("orcai_parameter"), "spectrogram")
    include_not_annotated = bool(kwargs.get("include_not_annotated", False))
    include_no_possible = bool(kwargs.get("include_no_possible_annotations", False))
    counts = count_spectrogram_eligible_rows(
        kwargs["recording_table_path"],
        orcai_parameter=kwargs.get("orcai_parameter"),
        include_not_annotated=include_not_annotated,
        include_no_possible_annotations=include_no_possible,
    )
    reject_empty_spectrogram_selection(
        counts,
        include_not_annotated=include_not_annotated,
        include_no_possible_annotations=include_no_possible,
    )
    if include_not_annotated or include_no_possible:
        msgr.info(
            "create-spectrograms flags: "
            f"include_not_annotated(-en)={include_not_annotated}; "
            f"include_no_possible_annotations(-enp)={include_no_possible}",
            indent=1,
        )
    out = Path(str(kwargs["output_dir"])).resolve()
    created = _run_with_artifacts(output=out, call=lambda: create_spectrograms(**kwargs))
    return {
        "recording_table_path": abs_str(kwargs["recording_table_path"]),
        "output_dir": str(out),
        "created_files": created,
        "include_not_annotated": include_not_annotated,
        "include_no_possible_annotations": include_no_possible,
        "eligible_rows": counts["eligible"],
        "cli_params": cli_params_from_engine(kwargs),
    }
