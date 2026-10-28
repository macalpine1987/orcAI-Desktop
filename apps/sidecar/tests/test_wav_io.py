"""Tests for WAV validation."""

from __future__ import annotations

import struct
import tempfile
import unittest
import wave
from pathlib import Path

from orcai_desktop_sidecar.wav_io import read_wav_meta, validate_wav_for_project


def _write_pcm16_mono(path: Path, *, frames: int, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * frames, *([0] * frames)))


def _has_soundfile() -> bool:
    try:
        import soundfile  # noqa: F401

        return True
    except ImportError:
        return False


class WavIoTests(unittest.TestCase):
    def test_validate_32bit_384k(self) -> None:
        if not _has_soundfile():
            self.skipTest("soundfile not installed")
        import numpy as np
        import soundfile as sf

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hi.wav"
            sf.write(path, np.zeros(3840, dtype=np.int32), 384_000, subtype="PCM_32")
            meta = validate_wav_for_project(path)
            self.assertEqual(meta["sample_rate_hz"], 384_000)
            self.assertEqual(meta["bit_depth"], 32)

    def test_validate_16bit_48k(self) -> None:
        if not _has_soundfile():
            self.skipTest("soundfile not installed")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ok.wav"
            _write_pcm16_mono(path, frames=4800, sample_rate=48_000)
            meta = validate_wav_for_project(path)
            self.assertEqual(meta["sample_rate_hz"], 48_000)
            self.assertEqual(meta["bit_depth"], 16)

    def test_rejects_float32(self) -> None:
        if not _has_soundfile():
            self.skipTest("soundfile not installed")
        import numpy as np
        import soundfile as sf

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "float.wav"
            sf.write(path, np.zeros(1000, dtype=np.float32), 48_000, subtype="FLOAT")
            with self.assertRaises(ValueError):
                validate_wav_for_project(path)

    def test_read_meta_high_sample_rate(self) -> None:
        if not _has_soundfile():
            self.skipTest("soundfile not installed")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hf.wav"
            _write_pcm16_mono(path, frames=192_000, sample_rate=192_000)
            meta = read_wav_meta(path)
            self.assertEqual(meta["sample_rate_hz"], 192_000)


if __name__ == "__main__":
    unittest.main()
