"""In-memory filter-predictions preview (never writes *_filtered.txt)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

# Same order as m04 / m05 class table (default row is computed separately).
CLASS_ORDER = ("WHISTLE", "BUZZ", "PHS", "SS", "BR", "HERDING", "TAILSLAP")

_COLUMNS = ["start", "stop", "label", "mean_p", "label_source"]


def default_call_duration_limits() -> dict[str, list[float | None]]:
    """Built-in orcAI default_call_duration_limits.json ([0, null] per class)."""
    import json
    from importlib.resources import files

    raw = files("orcai.defaults").joinpath("default_call_duration_limits.json")
    data = json.loads(raw.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError("default_call_duration_limits.json is not an object")
    return data


def strip_label_suffix(label: str, label_suffix: str | None) -> str:
    if label_suffix:
        return str(label).replace(str(label_suffix), "")
    return str(label)


def preview_filter_predictions(
    predicted_paths: list[str],
    call_duration_limits: dict[str, Any],
    *,
    label_suffix: str = "*",
) -> dict[str, Any]:
    """Run orcAI ``filter_predictions`` in memory; original files are not touched.

    Same core as the ``filter-predictions`` job (``delta_t=1``), so keep/drop stays
    aligned when orcAI adds filter rules beyond duration.
    """
    import pandas as pd
    from orcai.predict import filter_predictions

    missing: list[str] = []
    frames: list[pd.DataFrame] = []
    for raw in predicted_paths:
        path = Path(raw)
        if not path.is_file():
            missing.append(str(path))
            continue
        frame = pd.read_csv(
            path,
            sep="\t",
            encoding="utf-8",
            names=_COLUMNS,
        )
        frame["_src"] = str(path.resolve())
        frames.append(frame)

    empty_counts = {"found": 0, "keep": 0, "drop": 0}
    if not frames:
        return {
            "total": dict(empty_counts),
            "classes": [],
            "files_ok": 0,
            "files_missing": missing,
        }

    predicted = pd.concat(frames, ignore_index=True)
    if predicted.empty:
        return {
            "total": dict(empty_counts),
            "classes": [],
            "files_ok": len(frames),
            "files_missing": missing,
        }

    predicted["duration"] = predicted["stop"] - predicted["start"]
    predicted["class_key"] = predicted["label"].map(
        lambda label: strip_label_suffix(str(label), label_suffix)
    )
    predicted["_preview_id"] = range(len(predicted))

    # Engine mutates a working frame; keep our bookkeeping columns on ``predicted``.
    work = predicted[[*_COLUMNS, "_preview_id"]].copy()
    kept = filter_predictions(
        predicted_labels=work,
        delta_t=1,
        call_duration_limits=call_duration_limits,
        label_suffix=label_suffix,
        verbosity=0,
    )
    keep_ids = (
        set(kept["_preview_id"].tolist()) if "_preview_id" in kept.columns else set()
    )
    predicted["kept"] = predicted["_preview_id"].isin(keep_ids)

    by_class: dict[str, dict[str, Any]] = {}
    for key, group in predicted.groupby("class_key", sort=False):
        found = len(group)
        keep = int(group["kept"].sum())
        durations = [float(x) for x in group["duration"].tolist()]
        by_class[str(key)] = {
            "label": str(key),
            "found": found,
            "keep": keep,
            "drop": found - keep,
            "durations": durations,
        }

    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for code in CLASS_ORDER:
        if code in by_class:
            ordered.append(by_class[code])
            seen.add(code)
        else:
            ordered.append(
                {
                    "label": code,
                    "found": 0,
                    "keep": 0,
                    "drop": 0,
                    "durations": [],
                }
            )
            seen.add(code)
    for key, row in by_class.items():
        if key not in seen:
            ordered.append(row)

    found = len(predicted)
    keep = int(predicted["kept"].sum())
    return {
        "total": {"found": found, "keep": keep, "drop": found - keep},
        "classes": ordered,
        "files_ok": len(frames),
        "files_missing": missing,
    }
