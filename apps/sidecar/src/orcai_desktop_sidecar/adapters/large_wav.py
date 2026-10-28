"""Optional long-recording STFT path (Desktop setting, default off).

When enabled, files longer than ``FULL_FILE_SPECTROGRAM_MAX_SEC`` use a
viewport orcAI STFT (local quantiles) instead of a full-file matrix.
"""

from __future__ import annotations

FULL_FILE_SPECTROGRAM_MAX_SEC = 20 * 60


def use_windowed_orcai_stft(duration_sec: float, enabled: bool) -> bool:
    return bool(enabled) and float(duration_sec) > FULL_FILE_SPECTROGRAM_MAX_SEC
