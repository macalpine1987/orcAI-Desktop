"""Disk / artifact inventory for the training pipeline board."""

from __future__ import annotations

import contextlib
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.pipeline_annotations import annotation_stats
from orcai_desktop_sidecar.pipeline_artifacts import (
    _child_dir_count,
    _file_bundle,
    _gzip_data_rows,
    mtime,
    _snippet_rows_by_type,
    _table_row_count,
)
from orcai_desktop_sidecar.pipeline_constants import _TVT_SPLITS
from orcai_desktop_sidecar.project_registry import (
    list_wav_files,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_studio import (
    _parameter_calls,
    dir_stats,
    is_hidden,
    read_json_file,
)


@dataclass
class PipelineInventory:
    """Project-tree snapshot used by ``inspect_pipeline``."""

    project_dir: Path
    orcai_name: str
    param_path: Path
    parameter: dict[str, Any]
    model: dict[str, Any]
    spectrogram: dict[str, Any]
    snippets: dict[str, Any]
    calls: list[Any]
    table_path: Path | None
    table_rows: int
    table_mtime: float | None
    param_mtime: float | None
    spec_root: Path
    label_root: Path
    combined_root: Path
    tvt_dir: Path
    models_dir: Path
    hpsearch_dir: Path
    spec_count: int
    spec_size: int
    spec_mtime: float | None
    spec_path: Path | None
    label_count: int
    label_size: int
    label_mtime: float | None
    label_path: Path | None
    snippet_file: Path
    snippet_count: int
    snippet_size: int
    snippet_mtime: float | None
    snippet_rows: int | None
    snippet_by_type: dict[str, int]
    train_snippet_rows: int | None
    tvt_table_count: int
    tvt_table_size: int
    tvt_table_mtime: float | None
    tvt_tables_ready: bool
    tvt_data_count: int
    tvt_data_size: int
    tvt_data_mtime: float | None
    tvt_data_ready: bool
    hp_files: int
    hp_size: int
    hp_mtime: float | None
    keras_files: list[Path]
    train_count: int
    train_size: int
    train_mtime: float | None
    test_dir: Path
    test_count: int
    test_size: int
    test_mtime: float | None
    ann: dict[str, Any]
    wav_bytes: int
    free_bytes: int
    disk_measured: bool
    rec_data_dir: Path


def gather_pipeline_inventory(
    project_dir: Path,
    *,
    orcai_name: str,
) -> PipelineInventory:
    """Walk project dirs / files that drive board step state and readiness."""
    project_dir = project_dir.resolve()
    param_path = project_dir / f"{orcai_name}_orcai_parameter.json"
    parameter = read_json_file(param_path) or {}
    if not isinstance(parameter, dict):
        parameter = {}
    model = parameter.get("model") if isinstance(parameter.get("model"), dict) else {}
    spectrogram = (
        parameter.get("spectrogram") if isinstance(parameter.get("spectrogram"), dict) else {}
    )
    snippets = parameter.get("snippets") if isinstance(parameter.get("snippets"), dict) else {}
    calls = _parameter_calls(parameter)

    table_path = resolve_recording_table_path(project_dir)
    table_rows = _table_row_count(table_path)
    table_mtime = mtime(table_path)
    param_mtime = mtime(param_path)

    spec_root = project_dir / "spectrograms"
    label_root = project_dir / "label_arrays"
    combined_root = project_dir / "recording_data"
    tvt_dir = project_dir / "tvt_data"
    models_dir = project_dir / "models"
    hpsearch_dir = project_dir / "hpsearch"

    spec_count, spec_size, spec_mtime, spec_path = _child_dir_count(spec_root, "spectrogram")
    if spec_count == 0:
        spec_count, spec_size, spec_mtime, spec_path = _child_dir_count(combined_root, "spectrogram")
    label_count, label_size, label_mtime, label_path = _child_dir_count(label_root, "labels")
    if label_count == 0:
        label_count, label_size, label_mtime, label_path = _child_dir_count(combined_root, "labels")
    if label_count == 0:
        label_count, label_size, label_mtime, label_path = _child_dir_count(spec_root, "labels")

    snippet_file = tvt_dir / "all_snippets.csv.gz"
    snippet_count, snippet_size, snippet_mtime = _file_bundle([snippet_file])
    snippet_rows = _gzip_data_rows(snippet_file)
    # Per-split inventory for readiness (orcAI create_tvt raises on *any* short
    # split). Prefer filtered counts when orcAI is importable.
    snippet_by_type: dict[str, int] = {}
    if snippet_file.is_file():
        snippet_by_type = _snippet_rows_by_type(snippet_file)
        with contextlib.suppress(Exception):
            from orcai_desktop_sidecar.adapters.training import (
                _counts_after_orcai_filter,
            )

            filtered = _counts_after_orcai_filter(snippet_file, parameter)
            if filtered:
                snippet_by_type = {
                    str(k): int(v) for k, v in filtered.items()
                }
    train_snippet_rows = (
        int(snippet_by_type.get("train") or 0) if snippet_by_type else snippet_rows
    )

    tvt_tables = [tvt_dir / f"{name}.csv.gz" for name in _TVT_SPLITS]
    tvt_table_count, tvt_table_size, tvt_table_mtime = _file_bundle(tvt_tables)
    tvt_tables_ready = all(path.is_file() for path in tvt_tables)

    tvt_datasets = [tvt_dir / f"{name}_dataset" for name in _TVT_SPLITS]
    tvt_data_count, tvt_data_size, tvt_data_mtime = _file_bundle(tvt_datasets)
    tvt_data_ready = all(path.exists() for path in tvt_datasets)

    hp_files, hp_size, hp_mtime = dir_stats(hpsearch_dir) if hpsearch_dir.is_dir() else (0, 0, None)
    model_name = str(parameter.get("name") or orcai_name or "").strip()
    keras_files = [
        path
        for path in models_dir.rglob("*.keras")
        if path.is_file()
        and "hpsearch" not in path.parts
        and not is_hidden(path.relative_to(models_dir))
        and (
            not model_name
            or path.parent.name == model_name
            or path.stem == model_name
        )
    ] if models_dir.is_dir() else []
    history = models_dir / "training_history.json"
    shape = models_dir / "model_shape.json"
    train_paths = [*keras_files]
    if history.is_file():
        train_paths.append(history)
    if shape.is_file():
        train_paths.append(shape)
    train_count, train_size, train_mtime = _file_bundle(train_paths)
    if not train_mtime and keras_files:
        train_mtime = max(p.stat().st_mtime for p in keras_files)

    test_dir = models_dir / "test"
    metric_files = (
        list(test_dir.rglob("*_metrics.json"))
        if test_dir.is_dir()
        else []
    )
    if not metric_files and models_dir.is_dir():
        metric_files = [
            path
            for path in models_dir.rglob("*_metrics.json")
            if path.is_file() and not is_hidden(path.relative_to(models_dir))
        ]
    test_count, test_size, test_mtime = _file_bundle(
        metric_files if metric_files else ([test_dir] if test_dir.is_dir() else [])
    )

    ann = annotation_stats(project_dir, table_path, table_rows)

    rec_dir = recordings_dir(project_dir)
    wavs = list_wav_files(rec_dir)
    wav_bytes = 0
    for wav in wavs:
        try:
            wav_bytes += wav.stat().st_size
        except OSError:
            continue
    try:
        disk = shutil.disk_usage(project_dir if project_dir.is_dir() else Path.home())
        free_bytes = int(disk.free)
        disk_measured = True
    except OSError:
        free_bytes = 0
        disk_measured = False

    rec_data_dir = spec_path if spec_count else (
        combined_root if combined_root.is_dir() else spec_root
    )

    return PipelineInventory(
        project_dir=project_dir,
        orcai_name=orcai_name,
        param_path=param_path,
        parameter=parameter,
        model=model,
        spectrogram=spectrogram,
        snippets=snippets,
        calls=calls,
        table_path=table_path,
        table_rows=table_rows,
        table_mtime=table_mtime,
        param_mtime=param_mtime,
        spec_root=spec_root,
        label_root=label_root,
        combined_root=combined_root,
        tvt_dir=tvt_dir,
        models_dir=models_dir,
        hpsearch_dir=hpsearch_dir,
        spec_count=spec_count,
        spec_size=spec_size,
        spec_mtime=spec_mtime,
        spec_path=spec_path,
        label_count=label_count,
        label_size=label_size,
        label_mtime=label_mtime,
        label_path=label_path,
        snippet_file=snippet_file,
        snippet_count=snippet_count,
        snippet_size=snippet_size,
        snippet_mtime=snippet_mtime,
        snippet_rows=snippet_rows,
        snippet_by_type=snippet_by_type,
        train_snippet_rows=train_snippet_rows,
        tvt_table_count=tvt_table_count,
        tvt_table_size=tvt_table_size,
        tvt_table_mtime=tvt_table_mtime,
        tvt_tables_ready=tvt_tables_ready,
        tvt_data_count=tvt_data_count,
        tvt_data_size=tvt_data_size,
        tvt_data_mtime=tvt_data_mtime,
        tvt_data_ready=tvt_data_ready,
        hp_files=hp_files,
        hp_size=hp_size,
        hp_mtime=hp_mtime,
        keras_files=keras_files,
        train_count=train_count,
        train_size=train_size,
        train_mtime=train_mtime,
        test_dir=test_dir,
        test_count=test_count,
        test_size=test_size,
        test_mtime=test_mtime,
        ann=ann,
        wav_bytes=wav_bytes,
        free_bytes=free_bytes,
        disk_measured=disk_measured,
        rec_data_dir=rec_data_dir,
    )
