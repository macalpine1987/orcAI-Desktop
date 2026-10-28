"""Tests for label file parsing (orcAI seconds vs frame indices)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.adapters.labels import labels_preview


class LabelsPreviewTests(unittest.TestCase):
    def test_float_seconds_in_predicted_file(self) -> None:
        content = (
            "0.8533\t1.024\tBR*\t0.6047\torcai-isl-v1\n"
            "2.56\t3.6693\tSS*\t0.8317\torcai-isl-v1\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test_predicted.txt"
            path.write_text(content, encoding="utf-8")
            preview = labels_preview(path, wav_path=None)

        self.assertEqual(preview["time_unit"], "seconds")
        self.assertEqual(len(preview["segments"]), 2)
        seg0 = preview["segments"][0]
        self.assertAlmostEqual(seg0["start_sec"], 0.8533, places=4)
        self.assertAlmostEqual(seg0["stop_sec"], 1.024, places=4)

    def test_integer_frames(self) -> None:
        content = "100\t200\twhistles\t0.9\torcai\n"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "frames.txt"
            path.write_text(content, encoding="utf-8")
            preview = labels_preview(path, wav_path=None)

        self.assertEqual(preview["time_unit"], "frames")
        seg = preview["segments"][0]
        self.assertEqual(seg["start"], 100)
        self.assertEqual(seg["stop"], 200)


if __name__ == "__main__":
    unittest.main()
