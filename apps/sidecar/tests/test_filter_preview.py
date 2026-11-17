"""Unit tests for in-memory filter-predictions preview."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from orcai_desktop_sidecar.adapters.filter_preview import (
    preview_filter_predictions,
    strip_label_suffix,
)

from _librosa_runtime import require_librosa


def _write_pred(path: Path, rows: str) -> Path:
    path.write_text(rows, encoding="utf-8")
    return path


class FilterPreviewTests(unittest.TestCase):
    def test_strip_star_suffix(self) -> None:
        self.assertEqual(strip_label_suffix("WHISTLE*", "*"), "WHISTLE")
        self.assertEqual(strip_label_suffix("WHISTLE", "*"), "WHISTLE")

    def test_preview_matches_min_bound_keep_equal(self) -> None:
        require_librosa(self)
        with tempfile.TemporaryDirectory() as tmp:
            pred = _write_pred(
                Path(tmp) / "rec_predicted.txt",
                "0.0\t0.50\tWHISTLE\t0.9\torcai\n"
                "1.0\t1.02\tWHISTLE\t0.8\torcai\n"
                "2.0\t2.40\tBR\t0.7\torcai\n",
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
        require_librosa(self)
        with tempfile.TemporaryDirectory() as tmp:
            pred = _write_pred(
                Path(tmp) / "a_predicted.txt",
                "0.0\t0.01\tBUZZ\t0.9\torcai\n",
            )
            out = preview_filter_predictions(
                [str(pred)],
                {"default": [None, None], "BUZZ": [None, None]},
            )
            buzz = next(c for c in out["classes"] if c["label"] == "BUZZ")
            self.assertEqual(buzz["keep"], 1)
            self.assertEqual(buzz["drop"], 0)

    def test_preview_returns_every_duration(self) -> None:
        require_librosa(self)
        with tempfile.TemporaryDirectory() as tmp:
            pred = _write_pred(
                Path(tmp) / "rec_predicted.txt",
                "".join("0\t0.1\tWHISTLE\t0.9\torcai\n" for _ in range(4001)),
            )
            out = preview_filter_predictions(
                [str(pred)],
                {"default": [0, None]},
            )
            whistle = next(c for c in out["classes"] if c["label"] == "WHISTLE")
            self.assertEqual(len(whistle["durations"]), 4001)

    def test_json_roundtrip_null_max(self) -> None:
        blob = json.dumps({"WHISTLE": [0.1, None]})
        data = json.loads(blob)
        self.assertIsNone(data["WHISTLE"][1])

    def test_preview_keep_drop_matches_filter_predictions(self) -> None:
        """Stage 4: preview counters == orcAI filter_predictions on the same fixture."""
        require_librosa(self)
        from orcai.predict import filter_predictions

        with tempfile.TemporaryDirectory() as tmp:
            pred = _write_pred(
                Path(tmp) / "mix_predicted.txt",
                "0.0\t0.50\tWHISTLE\t0.9\torcai\n"
                "1.0\t1.02\tWHISTLE\t0.8\torcai\n"
                "2.0\t2.40\tBR\t0.7\torcai\n"
                "3.0\t3.01\tBUZZ*\t0.6\torcai\n"
                "4.0\t5.50\tBUZZ*\t0.5\torcai\n",
            )
            limits = {
                "default": [0.05, 1.0],
                "WHISTLE": [0.1, None],
                "BR": [0, None],
                "BUZZ": [0.1, 1.0],
            }
            out = preview_filter_predictions([str(pred)], limits, label_suffix="*")

            frame = pd.read_csv(
                pred,
                sep="\t",
                encoding="utf-8",
                names=["start", "stop", "label", "mean_p", "label_source"],
            )
            kept = filter_predictions(
                predicted_labels=frame.copy(),
                delta_t=1,
                call_duration_limits=limits,
                label_suffix="*",
                verbosity=0,
            )
            self.assertEqual(out["total"]["found"], len(frame))
            self.assertEqual(out["total"]["keep"], len(kept))
            self.assertEqual(out["total"]["drop"], len(frame) - len(kept))
            self.assertFalse(pred.with_name("mix_predicted_filtered.txt").exists())

    def test_preview_matches_filter_predictions_file_output(self) -> None:
        """Preview keep count equals lines written by filter_predictions_file."""
        require_librosa(self)
        from orcai.predict import filter_predictions_file

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pred = _write_pred(
                root / "rec_predicted.txt",
                "0.0\t0.50\tWHISTLE\t0.9\torcai\n"
                "1.0\t1.02\tWHISTLE\t0.8\torcai\n"
                "2.0\t2.40\tBR\t0.7\torcai\n",
            )
            limits = {
                "default": [0, None],
                "WHISTLE": [0.1, None],
                "BR": [0, None],
            }
            out = preview_filter_predictions([str(pred)], limits, label_suffix="*")
            filtered = root / "rec_predicted_filtered.txt"
            filter_predictions_file(
                predicted_labels_path=str(pred),
                output_file=str(filtered),
                overwrite=True,
                call_duration_limits=limits,
                label_suffix="*",
                verbosity=0,
            )
            written = filtered.read_text(encoding="utf-8").strip()
            n_written = 0 if not written else len(written.splitlines())
            self.assertEqual(out["total"]["keep"], n_written)


if __name__ == "__main__":
    unittest.main()
