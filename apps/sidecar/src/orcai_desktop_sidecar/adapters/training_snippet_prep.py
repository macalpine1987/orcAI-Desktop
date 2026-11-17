"""Snippet-table counts and n_batch clamping for training adapters."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.messenger import JobMessenger


def _count_snippets_by_type(snippet_table: Path) -> dict[str, int]:
    """Row counts per data_type from all_snippets.csv.gz (or .csv) — raw, unfiltered."""
    import csv
    import gzip

    path = Path(snippet_table)
    if not path.is_file():
        return {}
    counts: dict[str, int] = {}
    open_fn = gzip.open if path.suffix == ".gz" or path.name.endswith(".csv.gz") else open
    mode = "rt"
    with open_fn(path, mode, newline="") as handle:  # type: ignore[arg-type]
        reader = csv.DictReader(handle)
        for row in reader:
            key = str(row.get("data_type") or "").strip() or "unknown"
            counts[key] = counts.get(key, 0) + 1
    return counts


def _counts_after_orcai_filter(
    snippet_table: Path,
    orcai_parameter: dict[str, Any],
    msgr: JobMessenger | None = None,
) -> dict[str, int]:
    """Counts per split after the same ``_filter_snippet_table`` orcAI applies.

    create_tvt_snippet_tables samples from the *filtered* table; clamping on raw
    counts overshoots when fraction_removal drops empty snippets.
    """
    import numpy as np
    import pandas as pd
    from orcai.auxiliary import Messenger
    from orcai.snippets import SEED_ID_FILTER_SNIPPET_TABLE, _filter_snippet_table

    path = Path(snippet_table)
    if not path.is_file():
        return {}
    table = pd.read_csv(path)
    calls = orcai_parameter.get("calls")
    if not isinstance(calls, list) or not calls:
        return {
            str(k): int(v)
            for k, v in table["data_type"].value_counts().to_dict().items()
        }
    missing = [c for c in calls if c not in table.columns]
    if missing:
        # Table shape unexpected — fall back to raw counts.
        return {
            str(k): int(v)
            for k, v in table["data_type"].value_counts().to_dict().items()
        }

    seed = orcai_parameter.get("seed")
    rng = np.random.default_rng(
        seed=[SEED_ID_FILTER_SNIPPET_TABLE, seed if seed is not None else 0]
    )
    quiet = msgr if msgr is not None else Messenger(verbosity=0)
    filtered = _filter_snippet_table(
        table,
        orcai_parameter=orcai_parameter,
        rng=rng,
        msgr=quiet,
    )
    return {
        str(k): int(v)
        for k, v in filtered["data_type"].value_counts().to_dict().items()
    }


def _clamp_n_batches_to_snippets(
    orcai_parameter: Any,
    snippet_table: Path | None,
    msgr: JobMessenger | None = None,
    *,
    strict: bool = False,
) -> Any:
    """Cap model.n_batch_* so n_batch * batch_size ≤ *filtered* snippets per split.

    When ``orcai_parameter`` is a JSON path and values change, write a temp copy
    (never rewrite the project ``-p``). Dict input returns the clamped dict.

    When ``strict`` (train path): raise if a split needs batches but has fewer than
    ``batch_size`` snippets after filter (board-only train without prior TVT clamp).
    """
    from orcai.io import read_json, write_json

    path: Path | None = None
    if isinstance(orcai_parameter, (str, Path)):
        path = Path(str(orcai_parameter)).expanduser()
        if not path.is_file():
            return orcai_parameter
        doc = read_json(path)
    elif isinstance(orcai_parameter, dict):
        doc = dict(orcai_parameter)
    else:
        return orcai_parameter

    model = doc.get("model")
    if not isinstance(model, dict):
        return doc if path is None else orcai_parameter

    try:
        batch_size = int(model.get("batch_size") or 0)
    except (TypeError, ValueError):
        batch_size = 0
    if batch_size <= 0:
        return doc if path is None else orcai_parameter

    if snippet_table is None or not snippet_table.is_file():
        return doc if path is None else orcai_parameter

    try:
        counts = _counts_after_orcai_filter(snippet_table, doc, msgr=msgr)
    except Exception:  # noqa: BLE001 — fall back to raw if filter path fails
        counts = _count_snippets_by_type(snippet_table)
    if not counts:
        return doc if path is None else orcai_parameter

    changed: list[str] = []
    for split in ("train", "val", "test"):
        key = f"n_batch_{split}"
        try:
            current = int(model.get(key) or 0)
        except (TypeError, ValueError):
            continue
        if current <= 0:
            continue
        available = int(counts.get(split, 0))
        max_batches = available // batch_size
        if max_batches < 1:
            if strict:
                raise ValueError(
                    f"Not enough {split} snippets after filter ({available}) "
                    f"for batch_size={batch_size} (need at least one full batch)."
                )
            continue
        if current > max_batches:
            model[key] = max_batches
            changed.append(f"{key}: {current}→{max_batches} ({available} after filter)")

    if not changed:
        return doc if path is None else orcai_parameter

    doc["model"] = model
    if msgr is not None:
        msgr.info(
            "Clamped n_batch_* to fit filtered snippet table: " + "; ".join(changed),
            indent=1,
        )
    # TRN-02: never rewrite the project's on-disk -p; pass a temp copy to the engine.
    if path is not None:
        import tempfile

        tmp_dir = Path(tempfile.mkdtemp(prefix="orcai_nbatch_clamp_"))
        tmp_path = tmp_dir / path.name
        write_json(doc, tmp_path)
        return str(tmp_path)
    return doc

