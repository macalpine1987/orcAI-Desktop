"""Train wizard snippet calculator: how many snippets each split will have.

Estimate mirrors orcAI ``snippets._make_snippet_table`` + ``_filter_snippet_table``:

* a recording is cut into ``floor(duration / segment_duration)`` segments;
  recordings shorter than one segment are skipped;
* inside each segment, split ``k`` owns the window ``[offset_k, offset_k + f_k]``
  (fractions of the segment) and gets ``int(f_k * segment_duration *
  snippets_per_sec)`` snippets whose start is uniform in that window minus
  ``snippet_duration``;
* a snippet is "labelled" when its window overlaps an annotation of a selected
  class (after call equivalences and recording-table masks);
* ``fraction_removal`` of the unlabelled snippets is dropped.

When ``tvt_data/all_snippets.csv.gz`` exists and was cut with the same snippet
parameters, the exact post-filter counts from orcAI's own filter are returned too.
"""

from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_registry import (
    list_wav_files,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_studio import (
    _list_annotation_txt_files,
    _read_json_file,
    _read_table_rows,
    _require_project,
    _resolve_annotation_path,
    _resolve_table_file,
    _truthy_cell,
    _wav_meta_safe,
    parameter_json_path,
)

SPLITS: tuple[str, ...] = ("train", "val", "test")

# The estimate ignores random duplicates and frame rounding; keep a margin so the
# suggested n_batch still fits the real table.
SAFETY_MARGIN = 0.9

_SNIPPET_KEYS: tuple[str, ...] = (
    "segment_duration",
    "snippets_per_sec",
    "snippet_duration",
    "train",
    "val",
    "test",
)


def _read_intervals(path: Path) -> list[tuple[float, float, str]]:
    """Audacity labels ``start<TAB>stop<TAB>label``; frequency lines are skipped."""
    out: list[tuple[float, float, str]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for line in text.splitlines():
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        try:
            start = float(parts[0])
            stop = float(parts[1])
        except ValueError:
            continue
        label = parts[2].strip()
        if label and stop >= start:
            out.append((start, stop, label))
    return out


def _merge(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for start, stop in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], stop))
        else:
            merged.append((start, stop))
    return merged


def _kept_after_removal(total: int, labelled: int, fraction_removal: float) -> int:
    """Snippets left after orcAI ``_filter_snippet_table``.

    orcAI drops ``int(fraction_removal * n_unlabelled)`` rows (truncation toward
    zero). ``floor(n * (1 - fraction))`` is not the same for non-dyadic fractions
    such as 0.99.
    """
    empty = max(0, total - labelled)
    dropped = int(fraction_removal * empty)
    if dropped < 0:
        dropped = 0
    if dropped > empty:
        dropped = empty
    return labelled + (empty - dropped)


def _table_columns(path: Path) -> list[str]:
    import gzip

    opener = gzip.open if path.name.endswith(".gz") else open
    try:
        with opener(path, "rt", encoding="utf-8", newline="") as handle:  # type: ignore[arg-type]
            line = handle.readline()
    except OSError:
        return []
    if not line:
        return []
    return next(csv.reader([line]), [])


def _parameter_doc(project_dir: Path, project: dict[str, Any] | None) -> dict[str, Any] | None:
    """Same ``-p`` train uses: ``<orcai_name>_orcai_parameter.json``, then folder name."""
    candidates: list[Path] = []
    if project is not None:
        try:
            candidates.append(parameter_json_path(project))
        except (KeyError, TypeError):
            pass
    from orcai_desktop_sidecar.model_studio import project_parameter_path

    found = project_parameter_path(project_dir)
    if found is not None:
        candidates.append(found)
    seen: set[str] = set()
    for path in candidates:
        key = str(path)
        if key in seen or not path.is_file():
            continue
        seen.add(key)
        doc = _read_json_file(path)
        if doc:
            return doc
    return None


def _overlap(merged: list[tuple[float, float]], lo: float, hi: float) -> float:
    total = 0.0
    for start, stop in merged:
        if stop <= lo:
            continue
        if start >= hi:
            break
        total += min(stop, hi) - max(start, lo)
    return total


def _annotated_recordings(project_dir: Path) -> list[dict[str, Any]]:
    """Recordings that have both a WAV and a manual annotation (orcAI label input)."""
    table_path = resolve_recording_table_path(project_dir)
    columns: list[str] = []
    rows: list[dict[str, str]] = []
    if table_path is not None:
        try:
            columns, rows = _read_table_rows(table_path)
        except (OSError, csv.Error, UnicodeDecodeError):
            columns, rows = [], []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in rows:
        stem = (raw.get("recording") or "").strip()
        ann = _resolve_annotation_path(project_dir, raw, stem=stem or None)
        if ann is None or not ann.is_file():
            continue
        wav = _resolve_table_file(
            project_dir,
            raw.get("base_dir_recording", ""),
            raw.get("rel_recording_path", ""),
        )
        if (wav is None or not wav.is_file()) and stem:
            fallback = recordings_dir(project_dir) / f"{stem}.wav"
            if fallback.is_file():
                wav = fallback
        stem = stem or ann.stem
        seen.add(stem)
        masked = {
            col
            for col in columns
            if col in raw and _truthy_cell(raw.get(col)) is False
        }
        out.append({"stem": stem, "wav": wav, "annotation": ann, "masked": masked})

    wavs = {p.stem: p for p in list_wav_files(recordings_dir(project_dir))}
    for ann in _list_annotation_txt_files(project_dir):
        if ann.stem in seen or ann.stem not in wavs:
            continue
        seen.add(ann.stem)
        out.append(
            {"stem": ann.stem, "wav": wavs[ann.stem], "annotation": ann, "masked": set()}
        )
    return out


def _snippet_params(snippets: dict[str, Any]) -> dict[str, float]:
    def num(key: str, default: float) -> float:
        try:
            value = float(snippets.get(key, default))
        except (TypeError, ValueError):
            return default
        return value if math.isfinite(value) else default

    return {
        "segment_duration": max(0.0, num("segment_duration", 200)),
        "snippets_per_sec": max(0.0, num("snippets_per_sec", 3)),
        "snippet_duration": max(0.0, num("snippet_duration", 4)),
        "fraction_removal": min(1.0, max(0.0, num("fraction_removal", 0.99))),
        "train": max(0.0, num("train", 0.8)),
        "val": max(0.0, num("val", 0.1)),
        "test": max(0.0, num("test", 0.1)),
    }


def estimate_inventory(
    recordings: list[dict[str, Any]],
    *,
    calls: list[str],
    equivalences: dict[str, str],
    snippets: dict[str, Any],
) -> dict[str, Any]:
    """Expected per-split snippet counts before and after orcAI's empty-snippet filter."""
    p = _snippet_params(snippets)
    seg = p["segment_duration"]
    sd = p["snippet_duration"]
    call_set = set(calls)
    per_segment = {
        split: int(p[split] * seg * p["snippets_per_sec"]) for split in SPLITS
    }

    totals = {s: 0 for s in SPLITS}
    labelled = {s: 0.0 for s in SPLITS}
    used = 0
    too_short = 0
    no_duration = 0

    for rec in recordings:
        wav = rec.get("wav")
        duration = None
        if isinstance(wav, Path) and wav.is_file():
            duration = _wav_meta_safe(wav).get("duration_sec")
        try:
            duration = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None
        if not duration or duration <= 0:
            no_duration += 1
            continue
        n_segments = int(duration // seg) if seg > 0 else 0
        if n_segments <= 0:
            too_short += 1
            continue
        used += 1

        allowed = call_set - set(rec.get("masked") or ())
        starts: list[tuple[float, float]] = []
        for start, stop, label in _read_intervals(rec["annotation"]):
            mapped = equivalences.get(label) if equivalences else label
            if mapped and mapped in allowed:
                # A snippet starting at t covers [t, t+sd]; it overlaps the call
                # when t is in (start - sd, stop).
                starts.append((start - sd, stop))
        merged = _merge(starts)

        for i in range(n_segments):
            offset = 0.0
            for split in SPLITS:
                frac = p[split]
                count = per_segment[split]
                lo = (i + offset) * seg
                hi = (i + offset + frac) * seg - sd
                offset += frac
                # orcAI draws starts with numpy uniform(low, high); high must be
                # strictly above low, otherwise that split cannot be sampled.
                if count <= 0 or hi <= lo:
                    continue
                totals[split] += count
                width = hi - lo
                share = _overlap(merged, lo, hi) / width
                labelled[split] += count * share

    fr = p["fraction_removal"]
    splits: dict[str, dict[str, int]] = {}
    for split in SPLITS:
        lab = round(labelled[split])
        kept = _kept_after_removal(totals[split], lab, fr)
        splits[split] = {"total": totals[split], "labelled": lab, "kept": kept}
    return {
        "splits": splits,
        "recordings_used": used,
        "recordings_too_short": too_short,
        "recordings_no_duration": no_duration,
    }


def _measured_counts(
    project_dir: Path,
    *,
    calls: list[str],
    snippets: dict[str, Any],
    seed: Any,
    project: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Exact post-filter counts from an existing snippet table cut with the same params."""
    table = project_dir / "tvt_data" / "all_snippets.csv.gz"
    if not table.is_file():
        return None
    raw_snippets = (_parameter_doc(project_dir, project) or {}).get("snippets")
    draft = _snippet_params(snippets)
    # No on-disk snippets block → the table's cut parameters are unknown.
    if not isinstance(raw_snippets, dict) or not raw_snippets:
        return {"available": True, "matches_params": False, "splits": None}
    disk = _snippet_params(raw_snippets)
    matches = all(
        math.isclose(draft[k], disk[k], rel_tol=1e-9, abs_tol=1e-9) for k in _SNIPPET_KEYS
    )
    if not matches:
        return {"available": True, "matches_params": False, "splits": None}
    # Re-filtering a table that lacks the selected call columns falls back to raw
    # row counts inside the clamp helper. Those are not post-filter inventory.
    columns = set(_table_columns(table))
    if not calls or any(call not in columns for call in calls):
        return {"available": True, "matches_params": True, "splits": None}
    try:
        from orcai_desktop_sidecar.adapters.training import _counts_after_orcai_filter

        counts = _counts_after_orcai_filter(
            table,
            {
                "calls": calls,
                "snippets": {"fraction_removal": draft["fraction_removal"]},
                "seed": seed if seed is not None else 0,
            },
        )
    except Exception:  # noqa: BLE001 — measured counts are optional
        return {"available": True, "matches_params": True, "splits": None}
    return {
        "available": True,
        "matches_params": True,
        "splits": {s: int(counts.get(s, 0)) for s in SPLITS},
    }


def _suggest(kept: int, batch_size: int, margin: float) -> dict[str, int]:
    if batch_size <= 0:
        return {"max": 0, "suggested": 0}
    max_batches = kept // batch_size
    suggested = int((kept * margin) // batch_size)
    if max_batches >= 1:
        suggested = max(1, suggested)
    return {"max": max_batches, "suggested": suggested}


def calculate_snippets(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()

    calls = [str(c) for c in (body.get("calls") or []) if str(c).strip()]
    raw_eq = body.get("equivalences") or {}
    equivalences = (
        {str(k): str(v) for k, v in raw_eq.items() if str(k).strip()}
        if isinstance(raw_eq, dict)
        else {}
    )
    snippets = body.get("snippets") if isinstance(body.get("snippets"), dict) else {}
    try:
        batch_size = int(body.get("batch_size") or 0)
    except (TypeError, ValueError):
        batch_size = 0

    recordings = _annotated_recordings(project_dir)
    estimate = estimate_inventory(
        recordings, calls=calls, equivalences=equivalences, snippets=snippets
    )
    measured = _measured_counts(
        project_dir,
        calls=calls,
        snippets=snippets,
        seed=body.get("seed"),
        project=project,
    )

    measured_splits = measured.get("splits") if measured else None
    source = "measured" if measured_splits else "estimate"
    # Exact counts need no margin; the estimate does.
    margin = 1.0 if measured_splits else SAFETY_MARGIN

    splits: dict[str, Any] = {}
    for split in SPLITS:
        kept = int(
            measured_splits.get(split, 0)
            if measured_splits
            else estimate["splits"][split]["kept"]
        )
        splits[split] = {
            **estimate["splits"][split],
            "measured": measured_splits.get(split) if measured_splits else None,
            "available": kept,
            **_suggest(kept, batch_size, margin),
        }

    return {
        "project_id": project_id,
        "source": source,
        "batch_size": batch_size,
        "splits": splits,
        "recordings_annotated": len(recordings),
        "recordings_used": estimate["recordings_used"],
        "recordings_too_short": estimate["recordings_too_short"],
        "recordings_no_duration": estimate["recordings_no_duration"],
        "snippet_table": {
            "exists": bool(measured),
            "matches_params": bool(measured and measured.get("matches_params")),
        },
        "safety_margin": margin,
    }
