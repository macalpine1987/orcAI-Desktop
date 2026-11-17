"""Recording table studio ops (extracted from project_studio)."""

from __future__ import annotations

from orcai_desktop_sidecar.project_studio_table_io import (
    TABLE_STANDARD_COLUMNS,
    TABLE_WRITE_LOCK,
    _read_table_rows,
    _read_table_rows_raw,
    _require_project,
    _resolve_table_file,
    _wav_meta_safe,
    _write_table_rows,
    parameter_json_path,
)
from orcai_desktop_sidecar.project_studio_table_ops import (
    _parse_channel,
    _rewrite_annotation_base_dirs,
    _rewrite_table_base_dirs,
    read_recording_table,
    rewrite_table_base_dirs,
    set_recording_channel,
)
from orcai_desktop_sidecar.project_studio_table_status import (
    _is_manual_annotation_name,
    _predict_job_states,
    _predict_status,
    _predicted_files_by_stem,
    _recording_stem_from_predicted_name,
    _resolve_annotation_path,
)

__all__ = [
    "TABLE_STANDARD_COLUMNS",
    "TABLE_WRITE_LOCK",
    "parameter_json_path",
    "read_recording_table",
    "rewrite_table_base_dirs",
    "set_recording_channel",
]
