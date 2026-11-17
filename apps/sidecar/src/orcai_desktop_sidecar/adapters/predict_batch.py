"""CSV batch helpers for predict adapter."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.predict_paths import resolve_csv_batch_label_path


def _normalize_recording_names(raw: Any) -> list[str] | None:
    if raw is None:
        return None
    if not isinstance(raw, (list, tuple)):
        raise TypeError("recording_names must be a list of recording stems")
    names: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item).strip()
        if not text:
            continue
        base = Path(text).name
        stem = base[:-4] if base.lower().endswith(".wav") else base
        if stem in seen:
            continue
        seen.add(stem)
        names.append(stem)
    return names or None


def _resolve_table_wav(project_dir: Path | None, row: dict[str, str]) -> Path | None:
    base = (row.get("base_dir_recording") or "").strip()
    rel = (row.get("rel_recording_path") or "").strip()
    stem = (row.get("recording") or "").strip()
    candidates: list[Path] = []
    if base and rel:
        candidates.append(Path(base) / rel)
    if project_dir is not None and rel:
        candidates.append(project_dir / rel)
        candidates.append(project_dir / "recordings" / Path(rel).name)
    if project_dir is not None and stem:
        candidates.append(project_dir / "recordings" / f"{stem}.wav")
    for cand in candidates:
        try:
            if cand.is_file():
                return cand.resolve()
        except OSError:
            continue
    return None


def collect_csv_batch_files(
    table_path: Path,
    *,
    model_dir: Path,
    output_param: Any,
    project_dir: str | None,
    min_mtime: float | None = None,
) -> list[dict[str, Any]]:
    root = Path(project_dir).resolve() if project_dir else None
    files_out: list[dict[str, Any]] = []
    with table_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        stem = (row.get("recording") or "").strip()
        if not stem:
            continue
        try:
            channel = int(float(str(row.get("channel") or "1")))
        except ValueError:
            channel = 1
        wav_path = _resolve_table_wav(root, row)
        label_path: str | None = None
        status = "failed"
        label = resolve_csv_batch_label_path(
            wav_path=wav_path,
            stem=stem,
            channel=channel,
            model_dir=model_dir,
            output_param=output_param,
        )
        if label is not None and label.is_file():
            label_path = str(label)
            if min_mtime is None:
                status = "completed"
            else:
                try:
                    mtime = label.stat().st_mtime
                except OSError:
                    mtime = 0.0
                status = "completed" if mtime >= min_mtime else "preexisting"
        files_out.append(
            {
                "recording": stem,
                "channel": channel,
                "wav_path": str(wav_path) if wav_path else None,
                "label_path": label_path,
                "status": status,
            }
        )
    return files_out


# Compat alias
_collect_csv_batch_files = collect_csv_batch_files


def sanitize_csv_base_dir_recording(
    job_params: dict[str, Any],
    *,
    is_csv: bool,
    project_dir: str | None,
    warn: Any | None = None,
) -> dict[str, Any]:
    """
    Drop a stale ``base_dir_recording`` override for CSV jobs.

    orcAI rewrites every CSV row when this param is set. A Desktop setting from
    another project yields FileNotFoundError (logged by orcAI as ``: 2``).
    """
    if not is_csv:
        return job_params
    raw_bdr = job_params.get("base_dir_recording")
    if raw_bdr in (None, ""):
        return job_params
    out = dict(job_params)
    bdr_path = Path(str(raw_bdr)).expanduser()
    if not bdr_path.is_dir():
        if warn is not None:
            warn(f"Ignoring missing base_dir_recording override: {bdr_path}")
        out.pop("base_dir_recording", None)
        return out
    if project_dir:
        project_rec = Path(project_dir).resolve() / "recordings"
        try:
            bdr_resolved = bdr_path.resolve()
        except OSError:
            bdr_resolved = bdr_path
        if project_rec.is_dir() and bdr_resolved != project_rec.resolve():
            if warn is not None:
                warn(
                    "Ignoring base_dir_recording outside this project "
                    f"({bdr_path}); using paths from recording_table.csv"
                )
            out.pop("base_dir_recording", None)
    return out
