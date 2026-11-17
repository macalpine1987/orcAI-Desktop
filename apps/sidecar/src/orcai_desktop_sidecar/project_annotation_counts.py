"""Annotation / prediction / readiness summary helpers (extracted from project_registry)."""

from __future__ import annotations

import re
from pathlib import Path

from orcai_desktop_sidecar.project_paths import (
    annotations_dir,
    recordings_dir,
    _rel_is_hidden,
)
from orcai_desktop_sidecar.project_recordings_io import list_wav_files

def _is_manual_annotation_label(path: Path) -> bool:
    name = path.name.lower()
    if not name.endswith(".txt"):
        return False
    return not (name.endswith("_predicted.txt") or name.endswith("_filtered.txt"))


def _count_annotation_label_files(project_dir: Path) -> int:
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return 0
    count = 0
    for path in ann.rglob("*.txt"):
        if _rel_is_hidden(path, ann):
            continue
        if path.is_file() and _is_manual_annotation_label(path):
            count += 1
    return count


def _count_paired_annotation_label_files(project_dir: Path) -> int:
    """Manual ``.txt`` labels whose stem matches a WAV in ``recordings/``.

    Nested files count (same walk as the training gate). Predicted and filtered
    exports do not. One stem counts once.
    """
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return 0
    stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    if not stems:
        return 0
    seen: set[str] = set()
    for path in ann.rglob("*.txt"):
        if not path.is_file() or _rel_is_hidden(path, ann):
            continue
        if not _is_manual_annotation_label(path) or path.stem not in stems:
            continue
        seen.add(path.stem)
    return len(seen)


def _newest_manual_annotation_mtime(project_dir: Path) -> float | None:
    ann = annotations_dir(project_dir)
    if not ann.is_dir():
        return None
    newest: float | None = None
    for path in ann.iterdir():
        if not (path.is_file() and _is_manual_annotation_label(path)):
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        newest = mtime if newest is None else max(newest, mtime)
    return newest


# Same naming as project_studio / adapters/predict:
# ``{stem}_c{channel}_{model}_predicted.txt`` (plus a short legacy form).
_PREDICTED_CHANNEL_RE = re.compile(
    r"^(?P<stem>.+)_c(?P<channel>\d+)_(?P<model>.+)_predicted\.txt$",
)


def _recording_stem_from_predicted_name(
    name: str,
    wav_stems: set[str] | None = None,
) -> str | None:
    if not name.endswith("_predicted.txt"):
        return None
    match = _PREDICTED_CHANNEL_RE.match(name)
    if match:
        return match.group("stem")
    base = name[: -len("_predicted.txt")]
    # ``clip_a_orcai-isl-v1_predicted.txt`` (no channel) → match WAV stem ``clip_a``.
    if wav_stems:
        hits = [stem for stem in wav_stems if base == stem or base.startswith(f"{stem}_")]
        if hits:
            return max(hits, key=len)
    # Legacy short form used in tests / older exports: ``a_predicted.txt``.
    return base


def _predicted_files_by_stem(
    project_dir: Path,
    wav_stems: set[str] | None = None,
) -> dict[str, Path]:
    """Newest ``*_predicted.txt`` per recording stem (not ``*_predicted_filtered.txt``)."""
    found: dict[str, Path] = {}
    for path in project_dir.rglob("*_predicted.txt"):
        if _rel_is_hidden(path, project_dir) or not path.is_file():
            continue
        stem = _recording_stem_from_predicted_name(path.name, wav_stems)
        if not stem:
            continue
        prev = found.get(stem)
        if prev is None or path.stat().st_mtime > prev.stat().st_mtime:
            found[stem] = path
    return found


def _predicted_files_for_recordings(project_dir: Path) -> dict[str, Path]:
    """Predicted files whose stem matches a WAV in ``recordings/``."""
    wav_stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    predicted = _predicted_files_by_stem(project_dir, wav_stems or None)
    if not wav_stems:
        return predicted
    return {stem: path for stem, path in predicted.items() if stem in wav_stems}


def _filtered_sibling_for_predicted(predicted: Path) -> Path:
    """Same naming as ``resolve_filtered_output_path`` (``stem_filtered.txt``)."""
    return predicted.with_name(f"{predicted.stem}_filtered.txt")


def _prediction_needs_filter(predicted: Path) -> bool:
    """True when filtered is missing or older than a re-run prediction."""
    filtered = _filtered_sibling_for_predicted(predicted)
    if not filtered.is_file():
        return True
    try:
        return predicted.stat().st_mtime > filtered.stat().st_mtime
    except OSError:
        return True


def _count_predicted_labels(project_dir: Path) -> int:
    """Unique WAV stems that already have a prediction file."""
    return len(_predicted_files_for_recordings(project_dir))


def _count_predictions_needing_filter(project_dir: Path) -> int:
    """WAV stems whose newest prediction lacks an up-to-date filtered sibling."""
    return sum(
        1
        for path in _predicted_files_for_recordings(project_dir).values()
        if _prediction_needs_filter(path)
    )


def _count_tvt_dataset_files(project_dir: Path) -> int:
    tvt = project_dir / "tvt_data"
    if not tvt.is_dir():
        return 0
    return sum(
        1
        for path in tvt.rglob("*")
        if path.is_file() and not _rel_is_hidden(path, tvt)
    )


def _count_trained_model_checkpoints(project_dir: Path) -> int:
    models_dir = project_dir / "models"
    if not models_dir.is_dir():
        return 0
    return sum(
        1
        for path in models_dir.rglob("*.keras")
        if path.is_file() and not _rel_is_hidden(path, models_dir)
    )


def _primary_trained_model_name(project_dir: Path) -> str | None:
    models_dir = project_dir / "models"
    if not models_dir.is_dir():
        return None
    candidates: list[Path] = []
    for path in models_dir.rglob("*.keras"):
        if path.is_file() and not _rel_is_hidden(path, models_dir):
            candidates.append(path)
    if not candidates:
        return None
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    return newest.parent.name if newest.parent != models_dir else newest.stem


