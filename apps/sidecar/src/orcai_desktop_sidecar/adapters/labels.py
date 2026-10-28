"""Parse orcAI prediction label files for the spectrogram viewer."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from orcai_desktop_sidecar.adapters.spectrogram import (
    _load_power_chunk,
    _read_orcai_parameter,
    get_wav_meta,
)
from orcai_desktop_sidecar.adapters.spectrogram_render import (
    estimate_delta_t_sec,
    estimate_tf_bounds_hz,
    spectrogram_view_sample_rate,
)
from orcai_desktop_sidecar.adapters.spectrogram_tf_batch import (
    _MAX_TF_SEGMENTS,
    _MAX_WARNINGS,
    merge_load_windows,
    segment_time_bounds,
    slice_chunk_for_segment,
)

_log = logging.getLogger(__name__)

# Load via orcAI STFT path; map frequency bins with linear centers.
_TF_LOAD_KIND = "orcai"
_TF_AXIS_KIND = "linear"

LABEL_COLUMNS = ["start", "stop", "label", "mean_p", "label_source"]
TimeUnit = Literal["seconds", "frames"]


def parse_labels_file(path: str | Path) -> pd.DataFrame:
    from orcai_desktop_sidecar.paths import resolve_user_label_path

    label_path = resolve_user_label_path(str(path))

    df = pd.read_csv(
        label_path,
        sep="\t",
        encoding="utf-8",
        names=LABEL_COLUMNS,
    )
    if df.empty:
        return df

    # Drop header row if present.
    try:
        float(df.iloc[0]["start"])
        float(df.iloc[0]["stop"])
    except (TypeError, ValueError):
        df = df.iloc[1:].reset_index(drop=True)

    return df


def _parse_float(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _detect_time_unit(
    segments: list[dict[str, Any]],
    duration_sec: float | None,
) -> TimeUnit:
    if not segments:
        return "frames"

    for seg in segments:
        start = float(seg["start"])
        stop = float(seg["stop"])
        if abs(start - round(start)) > 1e-6 or abs(stop - round(stop)) > 1e-6:
            return "seconds"

    if duration_sec and duration_sec > 0:
        max_end = max(float(seg["stop"]) for seg in segments)
        if max_end <= duration_sec * 1.05:
            return "seconds"

    return "frames"


def get_delta_t(
    wav_path: str | Path,
    channel: int = 1,
    orcai_parameter_path: str | None = None,
) -> float | None:
    """Time step (seconds) per model output frame — matches orcAI predict."""
    try:
        meta = get_wav_meta(wav_path)
        param = _read_orcai_parameter(orcai_parameter_path)
        dt = estimate_delta_t_sec(param, float(meta["sample_rate"]))
        return dt if dt > 0 else None
    except (FileNotFoundError, ValueError, OSError):
        return None


def _resolve_delta_t(
    *,
    wav_path: str | Path | None,
    channel: int,
    orcai_parameter_path: str | None,
    segments: list[dict[str, Any]],
    time_unit: TimeUnit,
) -> float:
    if time_unit == "seconds":
        return 1.0

    max_frame = max((round(float(seg["stop"])) for seg in segments), default=1)
    duration_sec: float | None = None

    if wav_path:
        try:
            duration_sec = float(get_wav_meta(wav_path)["duration_sec"])
        except (FileNotFoundError, ValueError, OSError):
            duration_sec = None

    delta_t: float | None = None
    if wav_path:
        try:
            delta_t = get_delta_t(wav_path, channel, orcai_parameter_path)
        except Exception:  # noqa: BLE001 — optional orcAI delta_t; fall back below
            _log.debug("get_delta_t failed for %s", wav_path, exc_info=True)
            delta_t = None

    if delta_t is None or delta_t <= 0:
        if duration_sec and duration_sec > 0 and max_frame > 0:
            return duration_sec / max_frame
        return 1.0

    if duration_sec and duration_sec > 0 and segments:
        max_end = max(float(seg["stop"]) * delta_t for seg in segments)
        if max_end > duration_sec * 1.05 and max_frame > 0:
            return duration_sec / max_frame

    return delta_t


def _attach_tf_bounds(
    segments: list[dict[str, Any]],
    *,
    wav_path: str | Path,
    channel: int,
    orcai_parameter_path: str | None,
    windowed: bool = False,
) -> dict[str, Any]:
    """Fill hz_min / hz_max using batched spectrogram loads. Returns stats for UI."""
    stats: dict[str, Any] = {
        "computed": 0,
        "skipped": 0,
        "warnings": [],
    }
    if not segments:
        return stats

    try:
        meta = get_wav_meta(wav_path)
        sample_rate = float(meta["sample_rate"])
        param = _read_orcai_parameter(orcai_parameter_path)
        duration = float(meta["duration_sec"])
        working_sr = spectrogram_view_sample_rate(param, sample_rate)
    except (FileNotFoundError, ValueError, OSError) as exc:
        stats["warnings"].append(str(exc))
        stats["skipped"] = len(segments)
        return stats

    param_path = str(orcai_parameter_path) if orcai_parameter_path else None
    capped = segments[:_MAX_TF_SEGMENTS]
    stats["skipped"] = max(0, len(segments) - len(capped))

    windows = merge_load_windows(capped, duration)
    warnings: list[str] = []

    for win_t0, win_t1, win_segs in windows:
        try:
            chunk = _load_power_chunk(
                str(wav_path),
                t0=win_t0,
                t1=win_t1,
                channel=channel,
                orcai_parameter_path=param_path,
                display_kind=_TF_LOAD_KIND,
                windowed=windowed,
            )
        except Exception as exc:  # noqa: BLE001 — per-window TF load; warning returned to UI
            if len(warnings) < _MAX_WARNINGS:
                warnings.append(str(exc))
            stats["skipped"] += len(win_segs)
            continue

        for seg in win_segs:
            seg_t0, seg_t1 = segment_time_bounds(seg, duration)
            try:
                sub = slice_chunk_for_segment(
                    chunk, win_t0, win_t1, seg_t0, seg_t1,
                )
                hz_min, hz_max = estimate_tf_bounds_hz(
                    sub,
                    display_kind=_TF_AXIS_KIND,
                    sample_rate=working_sr,
                    orcai_parameter=param,
                )
                if hz_min is not None and hz_max is not None:
                    seg["hz_min"] = hz_min
                    seg["hz_max"] = hz_max
                    stats["computed"] += 1
                else:
                    stats["skipped"] += 1
            except Exception as exc:  # noqa: BLE001 — per-segment TF bounds; warning returned to UI
                if len(warnings) < _MAX_WARNINGS:
                    warnings.append(str(exc))
                stats["skipped"] += 1

    stats["warnings"] = warnings
    return stats


def labels_preview(
    label_path: str | Path,
    *,
    wav_path: str | Path | None = None,
    channel: int = 1,
    orcai_parameter_path: str | None = None,
    compute_tf_bounds: bool = True,
    windowed: bool = False,
) -> dict[str, Any]:
    df = parse_labels_file(label_path)

    segments: list[dict[str, Any]] = []
    for row in df.itertuples(index=False):
        start = _parse_float(row.start)
        stop = _parse_float(row.stop)
        if start is None or stop is None:
            continue
        if stop < start:
            start, stop = stop, start
        seg: dict[str, Any] = {
            "start": start,
            "stop": stop,
            "label": str(row.label),
            "mean_p": float(row.mean_p) if pd.notna(row.mean_p) else None,
            "label_source": str(row.label_source)
            if pd.notna(row.label_source)
            else None,
        }
        segments.append(seg)

    duration_sec: float | None = None
    if wav_path:
        try:
            duration_sec = float(get_wav_meta(wav_path)["duration_sec"])
        except (FileNotFoundError, ValueError, OSError):
            duration_sec = None

    time_unit = _detect_time_unit(segments, duration_sec)
    delta_t = _resolve_delta_t(
        wav_path=wav_path,
        channel=channel,
        orcai_parameter_path=orcai_parameter_path,
        segments=segments,
        time_unit=time_unit,
    )

    for seg in segments:
        start = float(seg["start"])
        stop = float(seg["stop"])
        if time_unit == "seconds":
            seg["start_sec"] = start
            seg["stop_sec"] = stop
        else:
            seg["start_sec"] = start * delta_t
            seg["stop_sec"] = stop * delta_t
        if seg["stop_sec"] <= seg["start_sec"]:
            seg["stop_sec"] = seg["start_sec"] + (
                delta_t if time_unit == "frames" else 0.05
            )

    labels: dict[str, int] = {}
    for seg in segments:
        labels[seg["label"]] = labels.get(seg["label"], 0) + 1

    tf_bounds: dict[str, Any] | None = None
    if compute_tf_bounds and wav_path and segments:
        tf_bounds = _attach_tf_bounds(
            segments,
            wav_path=wav_path,
            channel=channel,
            orcai_parameter_path=orcai_parameter_path,
            windowed=windowed,
        )

    return {
        "path": str(Path(label_path).resolve()),
        "wav_path": str(Path(wav_path).resolve()) if wav_path else None,
        "delta_t": delta_t,
        "time_unit": time_unit,
        "segment_count": len(segments),
        "labels": labels,
        "segments": segments,
        "tf_bounds": tf_bounds,
    }


def labels_to_audacity_text(
    label_path: str | Path,
    *,
    wav_path: str | Path | None = None,
    channel: int = 1,
    orcai_parameter_path: str | None = None,
) -> str:
    """Audacity label file: start_sec, end_sec, label (tab-separated)."""
    preview = labels_preview(
        label_path,
        wav_path=wav_path,
        channel=channel,
        orcai_parameter_path=orcai_parameter_path,
        compute_tf_bounds=False,
    )
    lines: list[str] = []
    for seg in preview["segments"]:
        t0 = float(seg["start_sec"])
        t1 = float(seg["stop_sec"])
        label = str(seg["label"]).replace("\t", " ")
        lines.append(f"{t0:.9f}\t{t1:.9f}\t{label}")
    return "\n".join(lines)


def export_audacity_labels(
    label_path: str | Path,
    output_path: str | Path,
    *,
    wav_path: str | Path | None = None,
    channel: int = 1,
    orcai_parameter_path: str | None = None,
) -> dict[str, str]:
    from orcai_desktop_sidecar.paths import resolve_user_output_path

    text = labels_to_audacity_text(
        label_path,
        wav_path=wav_path,
        channel=channel,
        orcai_parameter_path=orcai_parameter_path,
    )
    out = resolve_user_output_path(str(output_path))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    line_count = len(text.splitlines()) if text else 0
    return {"output_path": str(out.resolve()), "line_count": line_count}
