"""Stop a job before orcAI on parameter values that crash the engine.

The checks match what orcAI actually does: ``n_overlap`` is the STFT hop,
the upper frequency must sit at or below Nyquist, and a snippet must start
inside each positive train/val/test window. Nothing here rewrites the files
or the command the journal shows.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

_SPLITS = ("train", "val", "test")


def load_parameter_document(value: Any) -> dict[str, Any] | None:
    """Parameter dict for a guard, or None when orcAI will open its own default.

    A missing file is left for orcAI. Broken JSON fails the job here.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    path = Path(str(value)).expanduser()
    if not path.is_file():
        return None
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"orcai_parameter is not valid JSON: {path}") from exc
    if not isinstance(loaded, dict):
        raise ValueError(f"orcai_parameter must be a JSON object: {path}")  # noqa: TRY004
    return loaded


def reject_spectrogram_parameter(document: dict[str, Any]) -> None:
    """``create-spectrograms`` / ``make_spectrogram`` crash checks."""
    spec = _section(document, "spectrogram")
    sampling_rate = _as_int(spec.get("sampling_rate"), "spectrogram.sampling_rate")
    nfft = _as_int(spec.get("nfft"), "spectrogram.nfft")
    hop = _as_int(spec.get("n_overlap"), "spectrogram.n_overlap")
    low, high = _pair(spec.get("freq_range"), "spectrogram.freq_range")
    q_low, q_high = _pair(spec.get("quantiles"), "spectrogram.quantiles")

    if sampling_rate <= 0:
        raise ValueError("spectrogram.sampling_rate must be greater than 0")
    if nfft <= 0:
        raise ValueError("spectrogram.nfft must be greater than 0")
    if hop <= 0:
        raise ValueError(
            "spectrogram.n_overlap must be greater than 0. "
            "orcAI uses it as the STFT hop length"
        )
    nyquist = sampling_rate / 2
    if low < 0 or low >= high:
        raise ValueError(
            "spectrogram.freq_range must run from a lower bound of at least 0 "
            "up to a higher bound"
        )
    if high > nyquist:
        raise ValueError(
            f"spectrogram.freq_range upper bound {high:g} Hz is above the "
            f"Nyquist rate {nyquist:g} Hz"
        )
    if q_low < 0 or q_high > 1 or q_low >= q_high:
        raise ValueError(
            "spectrogram.quantiles must be between 0 and 1 "
            "with the low value below the high value"
        )


def reject_snippet_parameter(document: dict[str, Any]) -> None:
    """``create-snippet-table`` crash checks."""
    snippets = _section(document, "snippets")
    removal = _as_float(snippets.get("fraction_removal"), "snippets.fraction_removal")
    if removal < 0 or removal > 1:
        raise ValueError("snippets.fraction_removal must be between 0 and 1")

    segment = _as_float(snippets.get("segment_duration"), "snippets.segment_duration")
    duration = _as_float(snippets.get("snippet_duration"), "snippets.snippet_duration")
    windows: list[tuple[str, float]] = []
    for name in _SPLITS:
        fraction = _as_float(snippets.get(name), f"snippets.{name}")
        if fraction > 0:
            windows.append((name, fraction * segment))
    if not windows:
        return
    if segment <= 0:
        raise ValueError("snippets.segment_duration must be greater than 0")
    split, window = min(windows, key=lambda item: item[1])
    if duration >= window:
        raise ValueError(
            f"snippets.snippet_duration ({duration:g} s) must be shorter than "
            f"the {split} window ({window:g} s)"
        )


def reject_train_parameter(document: dict[str, Any]) -> None:
    """``train`` crash checks for epoch and batch size."""
    model = _section(document, "model")
    epochs = _as_int(model.get("epochs"), "model.epochs")
    batch_size = _as_int(model.get("batch_size"), "model.batch_size")
    if epochs <= 0:
        raise ValueError("model.epochs must be greater than 0")
    if batch_size <= 0:
        raise ValueError("model.batch_size must be greater than 0")


def reject_predict_channels(
    recording_path: str | Path,
    *,
    channel: Any = 1,
    base_dir_recording: Any = None,
) -> None:
    """Fail before ``predict`` when a channel is outside the WAV.

    A CSV uses each row's ``channel``. A single WAV uses the job channel.
    A missing file is left for orcAI.
    """
    path = Path(str(recording_path)).expanduser()
    if path.suffix.lower() == ".csv":
        _reject_csv_channels(path, channel=channel, base_dir_recording=base_dir_recording)
        return
    if path.suffix.lower() != ".wav" or not path.is_file():
        return
    chosen = _as_int(channel, "channel")
    _reject_one_channel(path, chosen, label=path.name)


def _reject_csv_channels(
    table: Path,
    *,
    channel: Any,
    base_dir_recording: Any,
) -> None:
    default = _as_int(channel, "channel")
    override = str(base_dir_recording).strip() if base_dir_recording not in (None, "") else ""
    with table.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if not row:
                continue
            raw = row.get("channel")
            chosen = default if raw is None or str(raw).strip() == "" else _as_int(raw, "channel")
            base = override or str(row.get("base_dir_recording") or "").strip()
            rel = str(row.get("rel_recording_path") or "").strip()
            if not base or not rel:
                continue
            wav = Path(base).expanduser() / rel
            if not wav.is_file():
                continue
            name = str(row.get("recording") or wav.name)
            _reject_one_channel(wav, chosen, label=name)


def _reject_one_channel(wav: Path, channel: int, *, label: str) -> None:
    from orcai_desktop_sidecar.wav_io import read_wav_meta

    channels = int(read_wav_meta(wav)["channels"])
    if channel < 1 or channel > channels:
        noun = "channel" if channels == 1 else "channels"
        raise ValueError(f"Channel {channel} is not in {label} ({channels} {noun})")


def _section(document: dict[str, Any], name: str) -> dict[str, Any]:
    raw = document.get(name)
    if not isinstance(raw, dict):
        raise ValueError(f"{name} is missing from orcai_parameter")  # noqa: TRY004
    return raw


def _pair(value: Any, label: str) -> tuple[float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError(f"{label} must be a pair of numbers")
    return _as_float(value[0], label), _as_float(value[1], label)


def _as_float(value: Any, label: str) -> float:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{label} must be a number")
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip().replace(",", "."))
        except ValueError as exc:
            raise ValueError(f"{label} must be a number") from exc
    else:
        raise ValueError(f"{label} must be a number")  # noqa: TRY004
    if not math.isfinite(number):
        raise ValueError(f"{label} must be a number")
    return number


def _as_int(value: Any, label: str) -> int:
    number = _as_float(value, label)
    if number != math.trunc(number):
        raise ValueError(f"{label} must be a whole number")
    return int(number)
