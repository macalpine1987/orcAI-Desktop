"""Shared parameter prep helpers for training adapters (extracted from training.py)."""

from __future__ import annotations

import contextlib
import shutil
from pathlib import Path
from typing import Any

_TEMP_PARAM_DIR_PREFIXES = ("orcai_nbatch_clamp_", "orcai_hps_apply_")


def cleanup_temp_orcai_parameter(value: Any) -> None:
    """Remove mkdtemp dirs created for clamped / hpsearch-applied -p copies."""
    if not isinstance(value, (str, Path)):
        return
    path = Path(str(value))
    parent = path.parent
    if not parent.name.startswith(_TEMP_PARAM_DIR_PREFIXES):
        return
    with contextlib.suppress(OSError):
        shutil.rmtree(parent, ignore_errors=True)


def normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(params)
    prepared.pop("project_dir", None)
    if prepared.get("compression_type") == "None":
        prepared["compression_type"] = None
    if "snippet_table_path" in prepared and "snippet_table" not in prepared:
        prepared["snippet_table"] = prepared.pop("snippet_table_path")
    if "tvt_snippet_tables_dir" in prepared and "tvt_dir" not in prepared:
        prepared["tvt_dir"] = prepared.pop("tvt_snippet_tables_dir")
    if "load_model" in prepared and isinstance(prepared["load_model"], str):
        prepared["load_model_from"] = prepared["load_model"]
        prepared["load_model"] = True
    return prepared


def prepare_read_params(params: dict[str, Any]) -> dict[str, Any]:
    """Normalize aliases, then match ``-ct`` to shards already in ``data_dir``."""
    from orcai_desktop_sidecar.tvt_compression import align_dataset_compression

    return align_dataset_compression(normalize_params(params))


def abs_str(value: Any) -> str:
    return str(Path(str(value)).expanduser().resolve())
