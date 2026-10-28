"""Unit tests for TVT n_batch clamping (after orcAI fraction_removal filter)."""

from __future__ import annotations

import csv
import gzip
import json
import tempfile
import unittest
from pathlib import Path


class TestClampNBatches(unittest.TestCase):
    def test_clamps_using_filtered_counts(self) -> None:
        from orcai_desktop_sidecar.adapters.training import (
            _clamp_n_batches_to_snippets,
            _counts_after_orcai_filter,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snippets = root / "all_snippets.csv.gz"
            # 100 train rows: 40 labeled + 60 empty → fraction_removal 0.99 drops ~59 empty
            # → ~41 remain → max_batches with bs=16 is 2
            with gzip.open(snippets, "wt", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "data_type",
                        "recording_data_dir",
                        "row_start",
                        "row_stop",
                        "SS",
                        "BUZZ",
                    ],
                )
                writer.writeheader()
                for i in range(40):
                    writer.writerow(
                        {
                            "data_type": "train",
                            "recording_data_dir": "/x",
                            "row_start": i,
                            "row_stop": i + 1,
                            "SS": 1,
                            "BUZZ": 0,
                        }
                    )
                for i in range(60):
                    writer.writerow(
                        {
                            "data_type": "train",
                            "recording_data_dir": "/x",
                            "row_start": 100 + i,
                            "row_stop": 101 + i,
                            "SS": 0,
                            "BUZZ": 0,
                        }
                    )
                for i in range(20):
                    writer.writerow(
                        {
                            "data_type": "val",
                            "recording_data_dir": "/x",
                            "row_start": i,
                            "row_stop": i + 1,
                            "SS": 1,
                            "BUZZ": 0,
                        }
                    )
                for i in range(20):
                    writer.writerow(
                        {
                            "data_type": "test",
                            "recording_data_dir": "/x",
                            "row_start": i,
                            "row_stop": i + 1,
                            "SS": 1,
                            "BUZZ": 0,
                        }
                    )

            param = root / "demo_orcai_parameter.json"
            doc = {
                "calls": ["SS", "BUZZ"],
                "seed": 0,
                "snippets": {
                    "fraction_removal": 0.99,
                    "segment_duration": 200,
                    "snippets_per_sec": 3,
                    "snippet_duration": 4,
                    "train": 0.8,
                    "val": 0.1,
                    "test": 0.1,
                },
                "model": {
                    "batch_size": 16,
                    "n_batch_train": 3750,
                    "n_batch_val": 375,
                    "n_batch_test": 375,
                },
            }
            param.write_text(json.dumps(doc), encoding="utf-8")

            filtered = _counts_after_orcai_filter(snippets, doc)
            self.assertLess(filtered.get("train", 0), 100)
            self.assertGreaterEqual(filtered.get("train", 0), 40)

            out = _clamp_n_batches_to_snippets(param, snippets, msgr=None)
            # TRN-02: returns a temp path; project -p stays unchanged.
            self.assertIsInstance(out, str)
            clamped = json.loads(Path(out).read_text(encoding="utf-8"))
            model = clamped["model"]
            max_train = filtered["train"] // 16
            self.assertEqual(model["n_batch_train"], max_train)
            self.assertLess(model["n_batch_train"], 100 // 16)  # not raw overshoot

            persisted = json.loads(param.read_text(encoding="utf-8"))
            self.assertEqual(persisted["model"]["n_batch_train"], 3750)

    def test_strict_raises_when_fewer_than_one_batch(self) -> None:
        from orcai_desktop_sidecar.adapters.training import (
            _clamp_n_batches_to_snippets,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snippets = root / "all_snippets.csv.gz"
            with gzip.open(snippets, "wt", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "data_type",
                        "recording_data_dir",
                        "row_start",
                        "row_stop",
                        "SS",
                    ],
                )
                writer.writeheader()
                for i in range(3):
                    writer.writerow(
                        {
                            "data_type": "train",
                            "recording_data_dir": "/x",
                            "row_start": i,
                            "row_stop": i + 1,
                            "SS": 1,
                        }
                    )
            param = {
                "calls": ["SS"],
                "seed": 0,
                "snippets": {
                    "fraction_removal": 0.0,
                    "segment_duration": 200,
                    "snippets_per_sec": 3,
                    "snippet_duration": 4,
                    "train": 0.8,
                    "val": 0.1,
                    "test": 0.1,
                },
                "model": {
                    "batch_size": 64,
                    "n_batch_train": 10,
                    "n_batch_val": 0,
                    "n_batch_test": 0,
                },
            }
            with self.assertRaises(ValueError) as ctx:
                _clamp_n_batches_to_snippets(
                    param, snippets, msgr=None, strict=True
                )
            self.assertIn("Not enough train snippets", str(ctx.exception))

            # run_train must stay non-strict (orcAI train does not re-check inventory).
            out = _clamp_n_batches_to_snippets(
                param, snippets, msgr=None, strict=False
            )
            self.assertIsInstance(out, (str, dict))



if __name__ == "__main__":
    unittest.main()
