"""Filtered recording_table.csv preparation for subset predict."""

from __future__ import annotations

import csv
from pathlib import Path

from orcai_desktop_sidecar.adapters.predict_paths import (
    PREDICT_SELECTION_CSV_NAME,
    PREDICT_SELECTION_DIRNAME,
)


def prepare_predict_recording_path(
    recording_path: Path,
    *,
    recording_names: list[str] | None,
    job_id: str,
    project_dir: str | None,
) -> tuple[Path, Path | None]:
    """
    Return (path_for_orcai, temp_csv_to_delete).

    When ``recording_names`` is set and input is a CSV, write a filtered table so
    orcAI runs its native CSV batch on the selected rows only.

    Uses ``adapters.predict.os`` / ``adapters.predict.tempfile`` at call time so
    tests can patch those names on the façade module.
    """
    # Late import: avoid circular load; bind os/tempfile from façade for patches.
    from orcai_desktop_sidecar.adapters import predict as _facade

    if recording_path.suffix.lower() != ".csv" or not recording_names:
        return recording_path, None

    wanted = set(recording_names)

    def _cell_stem(value: str) -> str:
        base = Path(value.strip()).name
        return base[:-4] if base.lower().endswith(".wav") else base

    with recording_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("recording_table.csv has no header")
        fieldnames = list(reader.fieldnames)
        all_rows = list(reader)

    all_stems: set[str] = set()
    for row in all_rows:
        stem = _cell_stem(row.get("recording") or "")
        if stem:
            all_stems.add(stem)

    rows = [
        row
        for row in all_rows
        if _cell_stem(row.get("recording") or "") in wanted
    ]

    present = {_cell_stem(r.get("recording") or "") for r in rows}
    missing = [name for name in recording_names if name not in present]
    if not rows:
        raise ValueError(
            "No matching rows in recording_table.csv for recording_names: "
            + ", ".join(recording_names)
        )
    if missing:
        raise ValueError(
            "recording_table.csv is missing selected recordings: " + ", ".join(missing)
        )

    if wanted == all_stems:
        return recording_path, None

    dest_root = Path(project_dir).resolve() if project_dir else None
    persist = dest_root is not None and dest_root.is_dir()
    if persist:
        cache = dest_root / PREDICT_SELECTION_DIRNAME
        cache.mkdir(parents=True, exist_ok=True)
        dest = cache / PREDICT_SELECTION_CSV_NAME
    else:
        fd, tmp_name = _facade.tempfile.mkstemp(
            prefix=f"orcai_predict_{job_id}_", suffix=".csv"
        )
        _facade.os.close(fd)
        dest = Path(tmp_name)

    try:
        with dest.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    except BaseException:
        # Non-persist mkstemp path is not returned on failure — remove orphan.
        if not persist:
            dest.unlink(missing_ok=True)
        raise

    resolved = dest.resolve()
    return resolved, None if persist else resolved
