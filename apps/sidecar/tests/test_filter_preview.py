"""Unit tests for in-memory filter-predictions preview."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.adapters.filter_preview import (
    preview_filter_predictions,
    strip_label_suffix,
)


class FilterPreviewTests(unittest.TestCase):
    def test_strip_star_suffix(self) -> None:
        self.assertEqual(strip_label_suffix("WHISTLE*", "*"), "WHISTLE")
        self.assertEqual(strip_label_suffix("WHISTLE", "*"), "WHISTLE")

    def test_preview_matches_min_bound_keep_equal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pred = Path(tmp) / "rec_predicted.txt"
            pred.write_text(
                "0.0\t0.50\tWHISTLE\t0.9\torcai\n"
                "1.0\t1.02\tWHISTLE\t0.8\torcai\n"
                "2.0\t2.40\tBR\t0.7\torcai\n",
                encoding="utf-8",
            )
            limits = {
                "default": [0, None],
                "WHISTLE": [0.1, None],
                "BR": [0, None],
            }
            out = preview_filter_predictions(
                [str(pred)],
                limits,
                label_suffix="*",
            )
            self.assertEqual(out["files_ok"], 1)
            self.assertEqual(out["total"]["found"], 3)
            whistle = next(c for c in out["classes"] if c["label"] == "WHISTLE")
            self.assertEqual(whistle["found"], 2)
            self.assertEqual(whistle["keep"], 1)
            self.assertEqual(whistle["drop"], 1)
            br = next(c for c in out["classes"] if c["label"] == "BR")
            self.assertEqual(br["found"], 1)
            self.assertEqual(br["keep"], 1)
            self.assertFalse(pred.with_name("rec_predicted_filtered.txt").exists())

    def test_empty_min_null_keeps_short_calls_like_orcai(self) -> None:
        """orcAI treats JSON null min as 0 — preview must match the engine."""
        with tempfile.TemporaryDirectory() as tmp:
            pred = Path(tmp) / "a_predicted.txt"
            pred.write_text("0.0\t0.01\tBUZZ\t0.9\torcai\n", encoding="utf-8")
            out = preview_filter_predictions(
                [str(pred)],
                {"default": [None, None], "BUZZ": [None, None]},
            )
            buzz = next(c for c in out["classes"] if c["label"] == "BUZZ")
            self.assertEqual(buzz["keep"], 1)
            self.assertEqual(buzz["drop"], 0)

    def test_json_roundtrip_null_max(self) -> None:
        blob = json.dumps({"WHISTLE": [0.1, None]})
        data = json.loads(blob)
        self.assertIsNone(data["WHISTLE"][1])


if __name__ == "__main__":
    unittest.main()
