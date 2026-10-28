"""Build exact `orcai …` command lines matching upstream CLI (orcAI 3.0.2)."""

from __future__ import annotations

import shlex
from typing import Any

# Ordered positional arguments (Click @click.argument).
_POSITIONALS: dict[str, tuple[str, ...]] = {
    "init": ("project_dir", "project_name"),
    "create-recording-table": ("base_dir_recording",),
    "predict": ("recording_path",),
    "filter-predictions": ("predicted_labels",),
    "create-spectrograms": ("recording_table_path", "output_dir"),
    "create-label-arrays": ("recording_table_path", "output_dir"),
    "create-snippet-table": ("recording_table_path", "recording_data_dir"),
    "create-tvt-snippet-tables": ("output_dir",),
    "create-tvt-data": ("tvt_dir",),
    "hpsearch": ("data_dir", "output_dir"),
    "train": ("data_dir", "output_dir"),
    "test": ("model_dir", "data_dir"),
}

# Option flags (Click @click.option short forms).
_OPTIONS: dict[str, dict[str, str]] = {
    "init": {
        "parameter": "-p",
        "verbosity": "-v",
    },
    "create-recording-table": {
        "output_path": "-o",
        "base_dir_annotation": "-bda",
        "default_channel": "-dc",
        "orcai_parameter": "-p",
        "update_table": "-ut",
        "update_paths": "-up",
        "exclude_patterns": "-ep",
        "remove_duplicate_filenames": "-rdf",
        "verbosity": "-v",
    },
    "predict": {
        "channel": "-c",
        "model": "-m",
        "model_dir": "-md",
        "output_path": "-o",
        "threshold": "-th",
        "overwrite": "-ow",
        "save_probabilities": "-sp",
        "base_dir_recording": "-bdr",
        "call_duration_limits": "-cdl",
        "label_suffix": "-ls",
        "verbosity": "-v",
    },
    "filter-predictions": {
        "output_file": "-o",
        "overwrite": "-ow",
        "call_duration_limits": "-cdl",
        "label_suffix": "-ls",
        # ``columns`` is Python-API only in orcAI 3.0.2 — do not emit fake -col.
        "verbosity": "-v",
    },
    "create-spectrograms": {
        "base_dir_recording": "-bdr",
        "orcai_parameter": "-p",
        "include_not_annotated": "-en",
        "include_no_possible_annotations": "-enp",
        "overwrite": "-ow",
        "verbosity": "-v",
    },
    "create-label-arrays": {
        "base_dir_annotation": "-bda",
        "orcai_parameter": "-p",
        "call_equivalences": "-ce",
        "overwrite": "-ow",
        "verbosity": "-v",
    },
    "create-snippet-table": {
        "output_dir": "-o",
        "orcai_parameter": "-p",
        "verbosity": "-v",
    },
    "create-tvt-snippet-tables": {
        "snippet_table": "-st",
        "orcai_parameter": "-p",
        "create_unfiltered_test_snippets": "-uts",
        "n_unfiltered_test_snippets": "-n_uts",
        "overwrite": "-ow",
        "verbosity": "-v",
    },
    "create-tvt-data": {
        "orcai_parameter": "-p",
        "overwrite": "-ow",
        "compression_type": "-ct",
        "verbosity": "-v",
    },
    "hpsearch": {
        "orcai_parameter": "-p",
        "hps_parameter": "-hp",
        "parallel": "-pl",
        "compression_type": "-ct",
        "verbosity": "-v",
    },
    "train": {
        "orcai_parameter": "-p",
        "compression_type": "-ct",
        "load_model": "-lm",
        "load_model_from": "-lmf",
        "verbosity": "-v",
    },
    "test": {
        "test_unfiltered": "-tu",
        "output_dir": "-o",
        "compression_type": "-ct",
        "verbosity": "-v",
    },
}

# UI / Desktop aliases → canonical CLI/engine names (before emit).
_ALIASES: dict[str, dict[str, str]] = {
    "filter-predictions": {
        "predicted_labels_path": "predicted_labels",
    },
    "create-snippet-table": {
        "output_path": "output_dir",
    },
    "create-tvt-snippet-tables": {
        "snippet_table_path": "snippet_table",
    },
    "create-tvt-data": {
        "tvt_snippet_tables_dir": "tvt_dir",
    },
    "init": {
        "path": "project_dir",
        "name": "project_name",
    },
}


def normalize_job_params(command: str, params: dict[str, Any] | None) -> dict[str, Any]:
    """Canonicalize aliases for CLI display and engine-aligned reporting."""
    raw = dict(params or {})
    aliases = _ALIASES.get(command, {})
    out: dict[str, Any] = {}
    for key, value in raw.items():
        canon = aliases.get(key, key)
        if canon in out and key in aliases:
            continue
        out[canon] = value

    if command == "train" and "load_model" in out and isinstance(out["load_model"], str):
        out["load_model_from"] = out["load_model"]
        out["load_model"] = True

    if out.get("compression_type") == "None":
        out["compression_type"] = None

    if command != "init":
        out.pop("project_dir", None)
    if command == "predict":
        out.pop("recording_names", None)
    if command == "create-recording-table":
        out.pop("overwrite", None)
        out.pop("update_table_path", None)
    if command == "create-tvt-data":
        out.pop("output_dir", None)
    if command == "test":
        out.pop("orcai_parameter", None)

    return out


def build_command_line(command: str, params: dict[str, Any] | None) -> str:
    """Return a shell-safe `orcai <command> …` string matching upstream CLI shape."""
    params = normalize_job_params(command, params)
    parts: list[str] = ["orcai", command]

    for key in _POSITIONALS.get(command, ()):
        if key not in params or params[key] is None:
            continue
        parts.append(str(params[key]))

    options = _OPTIONS.get(command, {})
    seen_flags: set[str] = set()
    for key, flag in options.items():
        if key not in params:
            continue
        if flag in seen_flags:
            continue
        value = params[key]
        if value is None:
            continue
        seen_flags.add(flag)
        if isinstance(value, bool):
            if value:
                parts.append(flag)
            continue
        if isinstance(value, (list, tuple)):
            parts.append(flag)
            parts.append(",".join(str(x) for x in value))
            continue
        parts.append(flag)
        parts.append(str(value))

    return " ".join(shlex.quote(p) for p in parts)
