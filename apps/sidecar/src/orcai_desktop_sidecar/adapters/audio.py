"""Mono playback WAV cache for in-app audio preview."""

from __future__ import annotations

import hashlib
from pathlib import Path

_CACHE_DIR = Path.home() / ".orcai-desktop" / "audio-cache"
# Skip building a full-file mono cache above this size (segment clips still work).
_MAX_FULL_CACHE_BYTES = 200 * 1024 * 1024
_MAX_CACHE_DIR_BYTES = 512 * 1024 * 1024
_BLOCK_FRAMES = 65_536


def _cache_key(wav_path: Path, channel: int) -> str:
    stat = wav_path.stat()
    raw = f"{wav_path.resolve()}|{channel}|{stat.st_mtime_ns}|{stat.st_size}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _enforce_cache_limit() -> None:
    if not _CACHE_DIR.is_dir():
        return
    entries: list[tuple[float, Path, int]] = []
    total = 0
    for path in _CACHE_DIR.glob("*.wav"):
        try:
            st = path.stat()
        except OSError:
            continue
        entries.append((st.st_mtime, path, st.st_size))
        total += st.st_size
    if total <= _MAX_CACHE_DIR_BYTES:
        return
    for _, path, _ in sorted(entries):
        try:
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            total -= size
        except OSError:
            continue
        if total <= _MAX_CACHE_DIR_BYTES:
            break


def ensure_mono_playback_wav(wav_path: str | Path, channel: int = 1) -> Path:
    """Return path to a cached mono 16-bit PCM WAV for HTML audio playback."""
    import soundfile as sf

    src = Path(wav_path).resolve()
    if not src.is_file():
        raise FileNotFoundError(f"WAV not found: {src}")

    if src.stat().st_size > _MAX_FULL_CACHE_BYTES:
        raise ValueError(
            "Recording is too large for full-file playback cache "
            f"(>{_MAX_FULL_CACHE_BYTES // (1024 * 1024)} MiB). "
            "Use segment playback or a shorter excerpt."
        )

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ch = max(1, int(channel))
    out = _CACHE_DIR / f"{_cache_key(src, ch)}_ch{ch}.wav"
    if out.is_file():
        return out

    info = sf.info(src)
    frames = info.frames
    sr = info.samplerate
    ch_idx = min(ch - 1, max(0, info.channels - 1))

    tmp = out.with_suffix(".part.wav")
    with sf.SoundFile(src, "r") as snd, sf.SoundFile(
        tmp,
        "w",
        samplerate=sr,
        channels=1,
        subtype="PCM_16",
    ) as out_snd:
        pos = 0
        while pos < frames:
            block = snd.read(
                min(_BLOCK_FRAMES, frames - pos),
                dtype="float32",
                always_2d=True,
            )
            if block.size == 0:
                break
            mono = block[:, ch_idx] if block.shape[1] > 1 else block[:, 0]
            out_snd.write(mono)
            pos += block.shape[0]

    tmp.replace(out)
    _enforce_cache_limit()
    return out


def write_wav_segment(
    wav_path: str | Path,
    channel: int,
    t0: float,
    t1: float,
    dest: Path,
) -> Path:
    """Extract [t0, t1] from a channel into a mono WAV file."""
    import soundfile as sf

    src = Path(wav_path).resolve()
    t0 = max(0.0, float(t0))
    t1 = max(t0 + 0.01, float(t1))

    info = sf.info(src)
    start_frame = int(t0 * info.samplerate)
    stop_frame = min(info.frames, int(t1 * info.samplerate))
    count = max(1, stop_frame - start_frame)
    ch_idx = min(max(1, int(channel)) - 1, max(0, info.channels - 1))

    dest.parent.mkdir(parents=True, exist_ok=True)
    with sf.SoundFile(src, "r") as snd:
        snd.seek(start_frame)
        data = snd.read(count, dtype="float32", always_2d=True)
    mono = data[:, ch_idx] if data.ndim > 1 and data.shape[1] > 1 else data.reshape(-1)
    sf.write(dest, mono, info.samplerate, subtype="PCM_16")
    _enforce_cache_limit()
    return dest
