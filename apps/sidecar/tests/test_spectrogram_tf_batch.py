"""Tests for TF bound batch window merging."""

from __future__ import annotations

import unittest

from orcai_desktop_sidecar.adapters.spectrogram_tf_batch import merge_load_windows


class SpectrogramTfBatchTests(unittest.TestCase):
    def test_merges_close_segments(self) -> None:
        segments = [
            {"start_sec": 1.0, "stop_sec": 2.0},
            {"start_sec": 2.5, "stop_sec": 3.5},
            {"start_sec": 10.0, "stop_sec": 11.0},
        ]
        windows = merge_load_windows(segments, duration_sec=60.0)
        self.assertEqual(len(windows), 2)
        self.assertEqual(len(windows[0][2]), 2)
        self.assertEqual(len(windows[1][2]), 1)

    def test_caps_window_count(self) -> None:
        segments = [
            {"start_sec": float(i * 10), "stop_sec": float(i * 10 + 1)}
            for i in range(30)
        ]
        windows = merge_load_windows(segments, duration_sec=400.0, max_windows=5)
        self.assertLessEqual(len(windows), 5)


if __name__ == "__main__":
    unittest.main()
