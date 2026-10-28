"""orcAI helper commands: init, create-recording-table (engine defaults pass-through)."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path
from typing import Any

from orcai.helpers import create_recording_table, init_project

from orcai_desktop_sidecar.engine_call import (
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
    snapshot_files,
)
from orcai_desktop_sidecar.messenger import JobMessenger
from orcai_desktop_sidecar.recording_table_params import (
    recording_table_backup_path,
    resolve_update_table_path,
    restore_recording_table_backup,
)


def _messenger(job_id: str, params: dict[str, Any], title: str) -> JobMessenger:
    verbosity = int(params["verbosity"]) if "verbosity" in params else 2
    return JobMessenger(job_id, verbosity=verbosity, title=title)


def run_init_project(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai_desktop_sidecar.job_cancel import check as check_cancelled

    check_cancelled(job_id)
    if not params.get("project_dir") or not params.get("project_name"):
        raise ValueError("project_dir and project_name are required")

    msgr = _messenger(job_id, params, "Initializing project")
    kwargs = engine_kwargs(
        init_project,
        params,
        required=("project_dir", "project_name"),
        inject={"msgr": msgr},
    )
    project_path = Path(str(kwargs["project_dir"])).resolve()
    before = snapshot_files(project_path if project_path.exists() else None)
    init_project(**kwargs)

    project_name = str(kwargs["project_name"])
    _normalize_parameter_seed(project_path, project_name)
    param_file = project_path / f"{project_name}_orcai_parameter.json"
    created = collect_created(
        param_file if param_file.is_file() else None,
        before=before,
        root=project_path if project_path.is_dir() else None,
        limit=50,
    )
    return {
        "project_dir": str(project_path),
        "project_name": project_name,
        "orcai_parameter": str(param_file) if param_file.exists() else None,
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def _sort_recording_table(table: Any) -> Any:
    """Stable A→Z by recording index (orcAI glob order is filesystem-dependent)."""
    if not hasattr(table, "sort_index") or len(table) == 0:
        return table
    return table.sort_index(key=lambda s: s.astype(str).str.casefold())


_STANDARD_TABLE_COLUMNS = frozenset(
    {
        "recording",
        "recording_type",
        "channel",
        "duplicate",
        "base_dir_recording",
        "rel_recording_path",
        "base_dir_annotation",
        "rel_annotation_path",
    }
)


def _cell_text(value: Any) -> str:
    try:
        import pandas as pd

        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _prune_merged_rows(table: Any) -> Any:
    """Drop what a merge carried over from files that are gone.

    orcAI merges with ``combine_first``: rows of deleted WAVs and the annotation
    path of a deleted ``.txt`` survive from the previous table. Rows whose
    paths are unknown are kept as they are.
    """
    columns = set(getattr(table, "columns", []))
    if not columns or len(table) == 0:
        return table
    out = table.copy()
    if {"base_dir_recording", "rel_recording_path"} <= columns:
        keep = []
        for base, rel in zip(
            out["base_dir_recording"], out["rel_recording_path"], strict=False
        ):
            base_s, rel_s = _cell_text(base), _cell_text(rel)
            keep.append(not base_s or not rel_s or (Path(base_s) / rel_s).is_file())
        out = out[keep]
    if {"base_dir_annotation", "rel_annotation_path"} <= columns and len(out):
        call_cols = [c for c in out.columns if c not in _STANDARD_TABLE_COLUMNS]
        for idx_pos in range(len(out)):
            base_s = _cell_text(out["base_dir_annotation"].iat[idx_pos])
            rel_s = _cell_text(out["rel_annotation_path"].iat[idx_pos])
            if not rel_s or not base_s or (Path(base_s) / rel_s).is_file():
                continue
            for col in ("base_dir_annotation", "rel_annotation_path", *call_cols):
                pos = out.columns.get_loc(col)
                if out[col].dtype == bool:
                    out[col] = out[col].astype(object)
                out.iat[idx_pos, pos] = None
    return out


def _fill_call_possibility_columns(table: Any) -> Any:
    """Mark class columns True when a row has an annotation path.

    orcAI ``create_recording_table`` leaves call columns as empty/NA. Empty cells
    mean «class masked / not possible»; ``create-label-arrays`` then crashes with
    ``Cannot mask with non-boolean array containing NA`` and spectrograms may
    skip every row. Desktop treats «has annotation file» as all listed classes
    possible (user can still mask later in the CSV).
    """
    if not hasattr(table, "columns") or "rel_annotation_path" not in table.columns:
        return table
    standard = {
        "recording",
        "channel",
        "duplicate",
        "base_dir_recording",
        "rel_recording_path",
        "base_dir_annotation",
        "rel_annotation_path",
    }
    call_cols = [c for c in table.columns if c not in standard]
    if not call_cols:
        return table
    out = table.copy()
    has_ann = out["rel_annotation_path"].notna() & (
        out["rel_annotation_path"].astype(str).str.strip() != ""
    )
    for col in call_cols:
        # Preserve explicit False/0 masks; only fill NA/empty.
        series = out[col]
        empty = series.isna() | (series.astype(str).str.strip() == "")
        out.loc[has_ann & empty, col] = True
    return out


def _normalize_parameter_seed(project_path: Path, project_name: str) -> None:
    """Rewrite init seed to a JSON-safe int (orcAI entropy overflows JS Number)."""
    import json

    param_file = project_path / f"{project_name}_orcai_parameter.json"
    if not param_file.is_file():
        return
    try:
        data = json.loads(param_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    seed = data.get("seed")
    if isinstance(seed, bool):
        return
    if isinstance(seed, int) and abs(seed) <= 2**53 - 1:
        return
    # Huge int / float from SeedSequence().entropy → keep lower 53 bits.
    try:
        as_int = int(seed)  # type: ignore[arg-type]
        safe = abs(as_int) % (2**53 - 1) or 1
    except (TypeError, ValueError, OverflowError):
        safe = 1
    data["seed"] = safe
    param_file.write_text(json.dumps(data, indent=4) + "\n", encoding="utf-8")


def run_create_recording_table(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai_desktop_sidecar.job_cancel import check as check_cancelled

    check_cancelled(job_id)
    base_dir = params.get("base_dir_recording")
    if not base_dir:
        raise ValueError("base_dir_recording is required")

    from orcai_desktop_sidecar.project_registry import normalize_wav_extensions

    normalize_wav_extensions(Path(str(base_dir)))

    msgr = _messenger(job_id, params, "Creating recording table")

    prepared = dict(params)
    overwrite = bool(prepared.pop("overwrite", False))
    prepared.pop("update_table_path", None)
    prepared.pop("update_table", None)
    if prepared.get("output_path") is None:
        prepared.pop("output_path", None)

    tentative_out = (
        Path(str(prepared["output_path"]))
        if "output_path" in prepared
        else Path(str(base_dir)) / "recording_table.csv"
    )
    update_table_path = resolve_update_table_path(params, tentative_out)

    # orcAI create_recording_table does sys.exit() when output_path already exists,
    # even when update_table is set. For merge we must free the output path while
    # keeping a side copy of the previous CSV for -ut. The side copy is put back
    # when the engine fails, so a failed sync never leaves the project without a table.
    update_src_tmp: Path | None = None
    succeeded = False
    try:
        if tentative_out.exists():
            if overwrite:
                update_src_tmp = recording_table_backup_path(tentative_out)
                os.replace(tentative_out, update_src_tmp)
                update_table_path = None
            elif update_table_path is None:
                raise FileExistsError(
                    f"Output already exists: {tentative_out}. Set overwrite=true to replace."
                )
            else:
                src = Path(update_table_path).resolve()
                out = tentative_out.resolve()
                if not src.is_file():
                    raise FileNotFoundError(f"update_table not found: {src}")
                update_src_tmp = recording_table_backup_path(tentative_out)
                os.replace(tentative_out, update_src_tmp)
                if src == out:
                    update_table_path = update_src_tmp

        inject: dict[str, Any] = {"msgr": msgr}
        if update_table_path is not None:
            inject["update_table"] = update_table_path

        kwargs = engine_kwargs(
            create_recording_table,
            prepared,
            required=("base_dir_recording",),
            inject=inject,
            skip=frozenset({"msgr", "update_table"}),
        )
        try:
            table = create_recording_table(**kwargs)
        except SystemExit as exc:
            # Engine exits the process on some validation errors; never leave the job hanging.
            raise RuntimeError(
                f"create-recording-table aborted (engine sys.exit): {exc.code!r}. "
                "Often caused by an existing output CSV without a proper merge prep."
            ) from exc

        out = kwargs.get("output_path")
        if out is None:
            output_resolved = Path(str(kwargs["base_dir_recording"])) / "recording_table.csv"
        else:
            output_resolved = Path(str(out))
        output_resolved = output_resolved.resolve()

        if update_table_path is not None:
            table = _prune_merged_rows(table)
        table = _sort_recording_table(table)
        table = _fill_call_possibility_columns(table)
        if hasattr(table, "to_csv"):
            table.to_csv(output_resolved)

        # Prefer project recordings/ + annotations/ over the folder annotations
        # were imported from (orcAI may keep the source base_dir_* when it still exists).
        with contextlib.suppress(Exception):
            from orcai_desktop_sidecar.project_studio import _rewrite_table_base_dirs

            project_guess = output_resolved.parent
            if (project_guess / "annotations").is_dir() or (
                project_guess / "recordings"
            ).is_dir():
                _rewrite_table_base_dirs(project_guess)

        annotated = (
            int(table["rel_annotation_path"].count())
            if "rel_annotation_path" in getattr(table, "columns", [])
            else 0
        )
        duplicates = (
            int(table["duplicate"].sum()) if "duplicate" in getattr(table, "columns", []) else 0
        )

        result = {
            "output_path": str(output_resolved),
            "row_count": len(table),
            "annotated_count": annotated,
            "duplicate_count": duplicates,
            "created_files": collect_created(output_resolved),
            "cli_params": cli_params_from_engine(kwargs),
        }
        succeeded = True
        return result
    finally:
        if update_src_tmp is not None:
            if succeeded:
                update_src_tmp.unlink(missing_ok=True)
            else:
                restore_recording_table_backup(tentative_out)
