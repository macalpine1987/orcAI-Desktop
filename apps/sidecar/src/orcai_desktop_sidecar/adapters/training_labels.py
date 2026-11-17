"""Create-label-arrays adapter (orcAI step)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.training_common import (
    _messenger,
    _run_with_artifacts,
)
from orcai_desktop_sidecar.adapters.training_params import (
    abs_str,
    normalize_params as _normalize_params,
)
from orcai_desktop_sidecar.engine_call import cli_params_from_engine, engine_kwargs


def _annotation_cell(value: Any) -> str:
    if value is None:
        return ""
    try:
        import pandas as pd

        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _same_annotation_dir(left: Path, right: Path) -> bool:
    try:
        return left.expanduser().resolve() == right.expanduser().resolve()
    except OSError:
        return False


def annotation_table_skipping_missing_txt(
    recording_table_path: str | Path,
    base_dir_annotation: str | Path,
) -> Path | None:
    """Temp CSV when ``-bda`` would hide a missing ``.txt`` or a row's own folder.

    ``None`` means every row's annotation file is in the shared folder, so the
    original table and ``-bda`` stay. The project CSV is never rewritten.
    A row is matched by ``rel_annotation_path``, not by the WAV stem.
    """
    import tempfile

    import pandas as pd

    shared = Path(str(base_dir_annotation)).expanduser()
    frame = pd.read_csv(recording_table_path)
    if "base_dir_annotation" not in frame.columns:
        frame["base_dir_annotation"] = pd.NA
    frame["base_dir_annotation"] = frame["base_dir_annotation"].astype(object)

    needs_temp = False
    if "rel_annotation_path" not in frame.columns:
        if len(frame):
            frame["base_dir_annotation"] = pd.NA
            needs_temp = True
    else:
        for idx in frame.index:
            rel = _annotation_cell(frame.at[idx, "rel_annotation_path"])
            if rel and (shared / rel).is_file():
                frame.at[idx, "base_dir_annotation"] = str(shared)
                continue
            own = _annotation_cell(frame.at[idx, "base_dir_annotation"])
            own_path = Path(own).expanduser() if own else None
            if (
                rel
                and own_path is not None
                and not _same_annotation_dir(own_path, shared)
                and (own_path / rel).is_file()
            ):
                needs_temp = True
                continue
            frame.at[idx, "base_dir_annotation"] = pd.NA
            needs_temp = True

    if not needs_temp:
        return None

    with tempfile.NamedTemporaryFile(
        prefix="orcai-label-table-",
        suffix=".csv",
        delete=False,
    ) as handle:
        temp = Path(handle.name)
    try:
        frame.to_csv(temp, index=False)
    except (OSError, ValueError, TypeError):  # noqa: BLE001 — leave path; re-raise
        temp.unlink(missing_ok=True)
        raise
    return temp


def _explicit_call_equivalences_fallback(params: dict[str, Any]) -> dict[str, Any] | None:
    """Wizard-only map (Desktop job param). Never invent identity from ``calls``."""
    raw = params.get("call_equivalences_fallback")
    if isinstance(raw, dict) and raw:
        return raw
    return None


def resolve_call_equivalences_for_engine(
    prepared: dict[str, Any],
    *,
    fallback: dict[str, Any] | None,
) -> tuple[dict[str, Any], str | None]:
    """Match CLI: optional ``-ce``. No silent identity map from ``orcai_parameter.calls``.

    Returns ``(prepared, note)``. ``note`` is a log line when the explicit
    Desktop fallback was used because ``-ce`` was missing or not a file.
    """
    ce = prepared.get("call_equivalences")
    if isinstance(ce, dict):
        return prepared, None
    if ce is None:
        if fallback is not None:
            prepared["call_equivalences"] = fallback
            return prepared, (
                "Desktop used call_equivalences_fallback "
                "(no -ce path; not an orcai invent-identity step)."
            )
        return prepared, None
    ce_path = Path(str(ce)).expanduser()
    if ce_path.is_file():
        return prepared, None
    if fallback is not None:
        prepared["call_equivalences"] = fallback
        return prepared, (
            f"Desktop used call_equivalences_fallback "
            f"(-ce path missing: {ce_path})."
        )
    # Keep the path: orcAI read_json fails like a bad CLI -ce, no Desktop patch.
    return prepared, None


def run_create_label_arrays(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.labels import create_label_arrays

    prepared = _normalize_params(params)
    fallback = _explicit_call_equivalences_fallback(params)
    prepared.pop("call_equivalences_fallback", None)
    prepared, ce_note = resolve_call_equivalences_for_engine(
        prepared, fallback=fallback
    )
    msgr = _messenger(job_id, params, "Creating label arrays")
    if ce_note:
        msgr.info(ce_note, indent=1)
    kwargs = engine_kwargs(
        create_label_arrays,
        prepared,
        required=("recording_table_path", "output_dir"),
        inject={"msgr": msgr},
    )
    # Command line and the job result keep the project table and ``-bda``.
    # orcAI only sees a temp CSV, and only when ``-bda`` would hide a missing
    # ``.txt`` or a row whose file lives in its own folder.
    reported_table = abs_str(kwargs["recording_table_path"])
    cli_params = cli_params_from_engine(kwargs)
    out = Path(str(kwargs["output_dir"])).resolve()
    temp_table: Path | None = None
    try:
        shared = kwargs.get("base_dir_annotation")
        if shared not in (None, ""):
            swapped = annotation_table_skipping_missing_txt(
                kwargs["recording_table_path"],
                shared,
            )
            if swapped is not None:
                temp_table = swapped
                kwargs["recording_table_path"] = swapped
                kwargs.pop("base_dir_annotation", None)
        created = _run_with_artifacts(
            output=out, call=lambda: create_label_arrays(**kwargs)
        )
    finally:
        if temp_table is not None:
            temp_table.unlink(missing_ok=True)
    return {
        "recording_table_path": reported_table,
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params,
    }
