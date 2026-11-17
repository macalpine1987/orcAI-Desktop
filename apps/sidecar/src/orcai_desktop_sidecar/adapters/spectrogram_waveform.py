"""Waveform PNG preview for the in-app viewer."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np

from orcai_desktop_sidecar.adapters.spectrogram_meta import get_wav_meta


def render_waveform_png(
    wav_path: str,
    *,
    t0: float = 0.0,
    t1: float | None = None,
    width: int = 800,
    height: int = 48,
    channel: int = 1,
) -> bytes:
    import librosa
    from PIL import Image, ImageDraw

    path = Path(wav_path)
    meta = get_wav_meta(path)
    duration = meta["duration_sec"]
    if t1 is None:
        t1 = duration
    t0 = max(0.0, t0)
    t1 = min(duration, t1)

    width = max(64, min(width, 4096))
    height = max(16, min(height, 256))

    y, _sr = librosa.load(
        path,
        sr=None,
        mono=False,
        offset=t0,
        duration=max(t1 - t0, 0.01),
    )
    if y.ndim > 1:
        idx = max(0, min(channel - 1, y.shape[0] - 1))
        y = y[idx]
    if y.size == 0:
        y = np.zeros(2, dtype=np.float32)

    step = max(1, len(y) // width)
    env = np.array(
        [np.max(np.abs(y[i : i + step])) for i in range(0, len(y), step)],
        dtype=np.float32,
    )
    if env.size < width:
        env = np.pad(env, (0, width - env.size))

    img = Image.new("L", (width, height), 235)
    draw = ImageDraw.Draw(img)
    mid = height // 2
    scale = (height / 2 - 2) / (float(env.max()) + 1e-8)
    for x, amp in enumerate(env[:width]):
        h = int(amp * scale)
        draw.line([(x, mid - h), (x, mid + h)], fill=0)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
