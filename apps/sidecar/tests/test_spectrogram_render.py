"""Unit tests for spectrogram tile rendering helpers."""

from __future__ import annotations

import unittest

import numpy as np

from orcai_desktop_sidecar.adapters.spectrogram import _to_uint8_gray
from orcai_desktop_sidecar.adapters.spectrogram_render import (
    _pad_audio_to_window,
    apply_colormap,
    estimate_delta_t_sec,
    estimate_tf_bounds_hz,
    frequency_energy_histogram,
    normalize_spectrogram_to_uint8,
    normalize_to_uint8,
    read_mel_params,
    read_stft_params,
    spectrogram_axis_max_hz,
)


class SpectrogramRenderTests(unittest.TestCase):
    def test_normalize_contrast_window(self) -> None:
        chunk = np.array([[0.0, 1.0], [2.0, 3.0]], dtype=np.float32)
        out = normalize_to_uint8(chunk, vmin_norm=0.25, vmax_norm=0.75)
        self.assertEqual(out.dtype, np.uint8)
        self.assertTrue(out.max() <= 255)

    def test_apply_colormap_rgb(self) -> None:
        gray = np.linspace(0, 255, 16, dtype=np.uint8).reshape(4, 4)
        rgb = apply_colormap(gray, "inferno")
        self.assertEqual(rgb.shape, (4, 4, 3))

    def test_colormap_inferno_differs_from_viridis(self) -> None:
        gray = np.linspace(0, 255, 64, dtype=np.uint8).reshape(8, 8)
        inferno = apply_colormap(gray, "inferno")
        viridis = apply_colormap(gray, "viridis")
        self.assertFalse(np.array_equal(inferno, viridis))
        self.assertGreater(float(np.mean(np.abs(inferno - viridis))), 8.0)

    def test_axis_max_hz_is_fixed_at_16k(self) -> None:
        param = {"sample_rate": 44_100, "n_mels": 128}
        hz = spectrogram_axis_max_hz(44_100.0, param)
        self.assertEqual(hz, 16_000)
        _n, _fmin, fmax = read_mel_params(param, 48_000.0)
        self.assertEqual(fmax, 16_000)

    def test_freq_range_from_orcai_params_caps_at_16k(self) -> None:
        param = {"spectrogram": {"freq_range": [0, 16_000], "nfft": 512}}
        _n, fmin, fmax = read_mel_params(param, 48_000.0)
        self.assertEqual(fmin, 0.0)
        self.assertEqual(fmax, 16_000)

    def test_histogram_bins_length(self) -> None:
        chunk = np.random.default_rng(0).random((32, 64)).astype(np.float32)
        bins = frequency_energy_histogram(chunk, bins=18)
        self.assertEqual(len(bins), 18)
        self.assertTrue(any(b > 0 for b in bins))

    def test_read_stft_params_defaults(self) -> None:
        n_fft, hop = read_stft_params({})
        self.assertEqual(n_fft, 512)
        self.assertEqual(hop, 256)

    def test_normalize_display_kind_aliases(self) -> None:
        from orcai_desktop_sidecar.adapters.spectrogram_render import (
            normalize_display_kind,
        )

        self.assertEqual(normalize_display_kind("log_mel"), "orcai")
        self.assertEqual(normalize_display_kind("orcai"), "orcai")
        self.assertEqual(normalize_display_kind("linear"), "linear")
        self.assertEqual(normalize_display_kind(None), "orcai")

    def test_read_stft_params_nested_orcai_json(self) -> None:
        param = {
            "spectrogram": {
                "nfft": 512,
                "n_overlap": 256,
                "sampling_rate": 48_000,
            },
        }
        n_fft, hop = read_stft_params(param)
        self.assertEqual(n_fft, 512)
        self.assertEqual(hop, 256)

    def test_normalize_orcai_db_has_contrast(self) -> None:
        db = np.linspace(-80.0, 0.0, 1000, dtype=np.float64).reshape(10, 100)
        param = {"spectrogram": {"quantiles": [0.01, 0.999]}}
        out = normalize_spectrogram_to_uint8(db, param, input_domain="db")
        self.assertGreater(float(out.std()), 20.0)
        self.assertGreater(int(out.max()), int(out.min()) + 10)

    def test_normalize_linear_magnitude_to_db(self) -> None:
        mag = np.logspace(-4, 0, 500, base=10, dtype=np.float64).reshape(10, 50)
        param = {"spectrogram": {"quantiles": [0.05, 0.95]}}
        out = normalize_spectrogram_to_uint8(mag, param, input_domain="linear")
        self.assertGreater(float(out.std()), 15.0)

    def test_to_uint8_gray_maps_orcai_unit_interval(self) -> None:
        chunk = np.linspace(0.0, 1.0, 1000, dtype=np.float32).reshape(10, 100)
        out = _to_uint8_gray(chunk)
        self.assertEqual(int(out.min()), 0)
        self.assertEqual(int(out.max()), 255)
        self.assertGreater(float(out.std()), 20.0)

    def test_linear_centers_follow_freq_range_not_native_nyquist(self) -> None:
        from orcai_desktop_sidecar.adapters.spectrogram_render import (
            _linear_freq_centers_hz,
        )

        param = {
            "spectrogram": {
                "sampling_rate": 48_000,
                "nfft": 512,
                "n_overlap": 256,
                "freq_range": [0, 16_000],
            }
        }
        # Chunk bins as produced after orcAI crop (~171); working SR is always 48 kHz.
        centers_ok = _linear_freq_centers_hz(171, 48_000.0, param)
        self.assertLessEqual(float(centers_ok[-1]), 16_000.0 + 1.0)
        centers_hi = _linear_freq_centers_hz(171, 48_000.0, param)
        self.assertAlmostEqual(float(centers_hi[-1]), float(centers_ok[-1]), places=1)

    def test_estimate_tf_bounds_linear(self) -> None:
        chunk = np.zeros((8, 32), dtype=np.float32)
        chunk[:, 10:18] = 4.0
        hz_min, hz_max = estimate_tf_bounds_hz(
            chunk,
            display_kind="linear",
            sample_rate=16000.0,
            orcai_parameter={"n_fft": 512, "hop_length": 256},
        )
        self.assertIsNotNone(hz_min)
        self.assertIsNotNone(hz_max)
        assert hz_min is not None and hz_max is not None
        self.assertLess(hz_min, hz_max)

    def test_estimate_tf_bounds_ignores_secondary_lobe(self) -> None:
        """First→last active bins used to span rumble+whistle; keep peak lobe only."""
        from orcai_desktop_sidecar.adapters.spectrogram_render import (
            _linear_freq_centers_hz,
        )

        param = {
            "spectrogram": {
                "sampling_rate": 48_000,
                "nfft": 512,
                "n_overlap": 256,
                "freq_range": [0, 16_000],
            }
        }
        n = 171
        centers = _linear_freq_centers_hz(n, 48_000.0, param)
        chunk = np.full((12, n), 0.05, dtype=np.float32)
        # Low-frequency rumble above threshold but not the peak.
        chunk[:, 2:6] = 0.35
        # Whistle peak around bins 40-54.
        chunk[:, 40:55] = 1.0

        hz_min, hz_max = estimate_tf_bounds_hz(
            chunk,
            display_kind="orcai",
            sample_rate=48_000.0,
            orcai_parameter=param,
        )
        self.assertIsNotNone(hz_min)
        self.assertIsNotNone(hz_max)
        assert hz_min is not None and hz_max is not None
        self.assertGreaterEqual(hz_min, float(centers[38]) - 50.0)
        self.assertLessEqual(hz_max, float(centers[56]) + 50.0)
        # Must not extend down into the rumble lobe.
        self.assertGreater(hz_min, float(centers[6]))

    def test_estimate_tf_bounds_high_floor_not_full_axis(self) -> None:
        """Normalized [0,1] tiles with a high noise floor must not report 0–16 kHz."""
        from orcai_desktop_sidecar.adapters.spectrogram_render import (
            _linear_freq_centers_hz,
        )

        param = {
            "spectrogram": {
                "sampling_rate": 48_000,
                "nfft": 512,
                "n_overlap": 256,
                "freq_range": [0, 16_000],
            }
        }
        n = 171
        centers = _linear_freq_centers_hz(n, 48_000.0, param)
        chunk = np.full((40, n), 0.28, dtype=np.float32)
        chunk[:, 48:62] = 0.95

        hz_min, hz_max = estimate_tf_bounds_hz(
            chunk,
            display_kind="orcai",
            sample_rate=48_000.0,
            orcai_parameter=param,
        )
        self.assertIsNotNone(hz_min)
        self.assertIsNotNone(hz_max)
        assert hz_min is not None and hz_max is not None
        self.assertGreater(hz_min, 1_000.0)
        self.assertLess(hz_max, 12_000.0)
        self.assertLess((hz_max - hz_min) / float(centers[-1]), 0.4)
        self.assertGreaterEqual(hz_min, float(centers[46]) - 80.0)
        self.assertLessEqual(hz_max, float(centers[63]) + 80.0)

    def test_estimate_tf_bounds_rejects_flat_spectrum(self) -> None:
        param = {
            "spectrogram": {
                "sampling_rate": 48_000,
                "nfft": 512,
                "n_overlap": 256,
                "freq_range": [0, 16_000],
            }
        }
        chunk = np.full((20, 171), 0.4, dtype=np.float32)
        hz_min, hz_max = estimate_tf_bounds_hz(
            chunk,
            display_kind="orcai",
            sample_rate=48_000.0,
            orcai_parameter=param,
        )
        self.assertIsNone(hz_min)
        self.assertIsNone(hz_max)

    def test_estimate_delta_t_from_hop(self) -> None:
        dt = estimate_delta_t_sec({"hop_length": 512}, 16000.0)
        self.assertAlmostEqual(dt, 512 / 16000.0, places=5)

    def test_pad_audio_to_window_extends_short_slice(self) -> None:
        y = np.zeros(100, dtype=np.float32)
        out = _pad_audio_to_window(y, 8000.0, 0.0, 0.02)
        self.assertEqual(out.shape[0], 160)


if __name__ == "__main__":
    unittest.main()
