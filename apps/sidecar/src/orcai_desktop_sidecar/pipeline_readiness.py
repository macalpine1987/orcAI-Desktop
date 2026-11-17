"""Pure readiness helpers for the training pipeline board / wizard."""

from __future__ import annotations

# Rough TVT float-feature footprint per snippet (train/val/test shards).
_BYTES_PER_TVT_SNIPPET = 24_000
# Spectrograms + label arrays are typically larger than raw WAV.
_SPEC_LABEL_MULT = 2.0
# Checkpoint / history headroom before train finishes.
_MODEL_HEADROOM_BYTES = 512 * 1024 * 1024
# When WAV sizes are unknown, floor per recording for spec+labels.
_FALLBACK_PER_REC_BYTES = 80 * 1024 * 1024


def disk_readiness_state(
    *,
    free_bytes: int,
    needed_bytes: int,
    measured: bool,
) -> str:
    """Wizard / pipeline disk lamp: ``ok`` | ``warn`` | ``off``.

    - ``off`` — free space below the estimate (blocks wizard launch).
    - ``warn`` — free is under 1.4× needed, or disk usage could not be measured.
    - ``ok`` — enough headroom, or nothing extra is needed yet.
    """
    if needed_bytes <= 0:
        return "ok"
    if not measured:
        return "warn"
    if free_bytes < needed_bytes:
        return "off"
    if free_bytes < needed_bytes * 1.4:
        return "warn"
    return "ok"


def estimate_pipeline_disk_needed(
    *,
    wav_bytes: int,
    table_rows: int,
    spec_count: int,
    label_count: int,
    tvt_data_ready: bool,
    train_ready: bool,
    required_snippets: int,
    snippet_rows: int | None,
    n_batch_train: int,
    n_batch_val: int,
    n_batch_test: int,
    batch_size: int,
    snippet_duration: float = 4.0,
    snippets_per_sec: float = 3.0,
) -> int:
    """Estimate *additional* bytes the remaining pipeline steps still need.

    Used by the Обучение readiness lamp and wizard preflight. Prefer WAV size and
    ``n_batch_* × batch_size``; fall back to duration × snippets_per_sec so the
    UI never shows «нужно ~0 Б» while create-spectrograms / TVT / train remain.
    """
    needed = 0
    rows = max(0, int(table_rows))
    specs = max(0, int(spec_count))
    labels = max(0, int(label_count))
    wav = max(0, int(wav_bytes))

    if rows > 0:
        remaining_spec = max(0, rows - min(specs, rows))
        if remaining_spec > 0:
            if wav > 0:
                needed += int(wav * (remaining_spec / rows) * _SPEC_LABEL_MULT)
            else:
                needed += remaining_spec * _FALLBACK_PER_REC_BYTES
        elif labels < min(specs, rows):
            remaining_lab = max(0, min(specs, rows) - labels)
            if wav > 0:
                needed += int(wav * (remaining_lab / rows) * 0.5)
            else:
                needed += remaining_lab * (_FALLBACK_PER_REC_BYTES // 4)

    if not tvt_data_ready:
        snip = max(0, int(required_snippets))
        bs = max(0, int(batch_size))
        if bs > 0:
            batches = (
                max(0, int(n_batch_train))
                + max(0, int(n_batch_val))
                + max(0, int(n_batch_test))
            )
            if batches > 0:
                snip = max(snip, batches * bs)
        if snip <= 0 and snippet_rows:
            snip = max(0, int(snippet_rows))
        if snip <= 0:
            duration = float(snippet_duration) if snippet_duration > 0 else 4.0
            sps = float(snippets_per_sec) if snippets_per_sec > 0 else 3.0
            if wav > 0:
                # 16-bit mono @ 48 kHz ≈ 96 KiB/s
                approx_sec = wav / 96_000.0
                snip = int(max(1_000, approx_sec * sps * 0.5))
            else:
                n_ann = max(1, rows)
                snip = int(max(1_000, n_ann * duration * sps * 60))
        needed += snip * _BYTES_PER_TVT_SNIPPET

    if not train_ready:
        needed += _MODEL_HEADROOM_BYTES

    return int(needed)


def unlabeled_recordings_lamp(wav_count: int, paired_count: int) -> str:
    """Skip lamp: no WAV is not a warning.

    Green when every WAV has a matching annotation. The subtitle stays
    «0 will be skipped» in that case. A gap stays yellow.
    """
    if wav_count <= 0:
        return "off"
    if paired_count == wav_count:
        return "ok"
    return "warn"


def recordings_table_lamp(sync: str, *, table_rows: int, wav_count: int) -> str:
    """Green only for a current table that has rows.

    A stale table, or a missing table while WAV files are present, is a warning.
    An empty project stays off and is not described as current.
    """
    if sync == "current" and table_rows > 0:
        return "ok"
    if sync == "stale" or (sync == "missing" and wav_count > 0):
        return "warn"
    return "off"
