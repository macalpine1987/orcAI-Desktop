"""Tests for audio cache helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

from orcai_desktop_sidecar.adapters import audio


class AudioCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._cache = self._home / "audio-cache"
        self._patch_cache = patch.object(audio, "_CACHE_DIR", self._cache)
        self._patch_cache.start()
        self._patch_max = patch.object(audio, "_MAX_FULL_CACHE_BYTES", 1024 * 1024)
        self._patch_max.start()

    def tearDown(self) -> None:
        self._patch_max.stop()
        self._patch_cache.stop()
        self._tmp.cleanup()

    def _write_stereo_wav(self, path: Path, frames: int = 8000) -> None:
        sr = 8000
        t = np.linspace(0, 1, frames, endpoint=False)
        left = (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        right = (0.2 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
        data = np.column_stack([left, right])
        sf.write(path, data, sr, subtype="PCM_16")

    def test_segment_extract(self) -> None:
        wav = self._home / "rec.wav"
        self._write_stereo_wav(wav)
        out = self._cache / "seg.wav"
        audio.write_wav_segment(wav, 2, 0.1, 0.3, out)
        self.assertTrue(out.is_file())
        info = sf.info(out)
        self.assertEqual(info.channels, 1)
        self.assertGreater(info.frames, 0)

    def test_full_cache_rejects_huge_file(self) -> None:
        with patch.object(audio, "_MAX_FULL_CACHE_BYTES", 400):
            wav = self._home / "big.wav"
            self._write_stereo_wav(wav, frames=120_000)
            with self.assertRaises(ValueError):
                audio.ensure_mono_playback_wav(wav, 1)

    def test_mono_cache_roundtrip(self) -> None:
        wav = self._home / "rec.wav"
        self._write_stereo_wav(wav)
        cached = audio.ensure_mono_playback_wav(wav, 2)
        self.assertTrue(cached.is_file())
        cached2 = audio.ensure_mono_playback_wav(wav, 2)
        self.assertEqual(cached, cached2)


if __name__ == "__main__":
    unittest.main()
