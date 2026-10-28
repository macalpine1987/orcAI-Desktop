"""Tests for orcAI make_spectrogram disk cache (exact path)."""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np


def _orcai_installed() -> bool:
    return importlib.util.find_spec("orcai") is not None


class SpectrogramCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        os.environ["ORCAI_SPEC_CACHE_ROOT"] = self._tmpdir.name
        from orcai_desktop_sidecar.adapters import spectrogram_cache as sc

        sc.clear_ram_cache()

    def tearDown(self) -> None:
        from orcai_desktop_sidecar.adapters import spectrogram_cache as sc

        sc.clear_ram_cache()
        os.environ.pop("ORCAI_SPEC_CACHE_ROOT", None)
        self._tmpdir.cleanup()

    def test_full_spectrogram_roundtrip_float32(self) -> None:
        from orcai_desktop_sidecar.adapters.spectrogram_cache import (
            has_full_spectrogram,
            load_full_spectrogram,
            save_full_spectrogram,
        )

        spec = np.linspace(0, 1, 40, dtype=np.float32).reshape(10, 4)
        times = np.linspace(0, 1, 10, dtype=np.float64)
        save_full_spectrogram("full1", spec, times)
        self.assertTrue(has_full_spectrogram("full1"))
        loaded = load_full_spectrogram("full1")
        self.assertIsNotNone(loaded)
        assert loaded is not None
        got, got_t = loaded
        np.testing.assert_allclose(got, spec, atol=0)
        np.testing.assert_allclose(got_t, times)

    def test_tile_matches_make_spectrogram_slice(self) -> None:
        """Cached tile chunk equals a direct make_spectrogram time slice."""
        from orcai.auxiliary import Messenger
        from orcai.spectrogram import make_spectrogram

        from orcai_desktop_sidecar.adapters.spectrogram import (
            _load_orcai_spectrogram_chunk,
            clear_spectrogram_cache,
        )

        with tempfile.TemporaryDirectory() as td:
            os.environ["ORCAI_SPEC_CACHE_ROOT"] = td
            clear_spectrogram_cache()
            wav_path = Path(td) / "tone.wav"
            sr = 48_000
            n = sr * 2
            t = np.arange(n, dtype=np.float64) / sr
            mono = (0.2 * np.sin(2 * np.pi * 1000.0 * t)).astype(np.float32)
            pcm = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                wf.writeframes(pcm.tobytes())

            full, _, times = make_spectrogram(
                wav_path,
                1,
                msgr=Messenger(verbosity=0),
            )
            t0, t1 = 0.25, 1.25
            i0 = int(np.searchsorted(times, t0, side="left"))
            i1 = int(np.searchsorted(times, t1, side="right"))
            expected = np.asarray(full[i0:i1, :], dtype=np.float32)

            chunk = _load_orcai_spectrogram_chunk(
                str(wav_path),
                t0=t0,
                t1=t1,
                channel=1,
                orcai_parameter_path=None,
            )
            np.testing.assert_allclose(chunk, expected, atol=1e-6)

            # Second call hits disk/RAM cache — same values.
            chunk2 = _load_orcai_spectrogram_chunk(
                str(wav_path),
                t0=t0,
                t1=t1,
                channel=1,
                orcai_parameter_path=None,
            )
            np.testing.assert_allclose(chunk2, expected, atol=1e-6)
            self.assertTrue(list(Path(td).rglob("spectrogram.f32.npy")))
            clear_spectrogram_cache()
            os.environ.pop("ORCAI_SPEC_CACHE_ROOT", None)

    @unittest.skipUnless(_orcai_installed(), "orcai not installed")
    def test_windowed_flag_skips_full_file_npy(self) -> None:
        from unittest.mock import patch

        from orcai_desktop_sidecar.adapters.spectrogram import (
            _load_orcai_spectrogram_chunk,
            clear_spectrogram_cache,
            ensure_orcai_spectrogram_cached,
        )

        with tempfile.TemporaryDirectory() as td:
            os.environ["ORCAI_SPEC_CACHE_ROOT"] = td
            clear_spectrogram_cache()
            wav_path = Path(td) / "tone.wav"
            sr = 48_000
            n = sr * 2
            t = np.arange(n, dtype=np.float64) / sr
            mono = (0.2 * np.sin(2 * np.pi * 1000.0 * t)).astype(np.float32)
            pcm = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                wf.writeframes(pcm.tobytes())

            with patch(
                "orcai_desktop_sidecar.adapters.spectrogram.use_windowed_orcai_stft",
                return_value=True,
            ):
                warmed = ensure_orcai_spectrogram_cached(
                    str(wav_path),
                    windowed=True,
                )
                self.assertTrue(warmed.get("skipped"))
                chunk = _load_orcai_spectrogram_chunk(
                    str(wav_path),
                    t0=0.2,
                    t1=0.8,
                    channel=1,
                    orcai_parameter_path=None,
                    windowed=True,
                )
            self.assertGreater(chunk.size, 0)
            self.assertFalse(list(Path(td).rglob("spectrogram.f32.npy")))
            clear_spectrogram_cache()
            os.environ.pop("ORCAI_SPEC_CACHE_ROOT", None)


if __name__ == "__main__":
    unittest.main()
