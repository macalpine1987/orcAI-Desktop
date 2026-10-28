"""QA-M2: hpsearch best_hyperparameters merge into orcai_parameter before train."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.adapters.training import (
    _apply_best_hyperparameters_before_train,
    _find_best_hyperparameters_json,
    _merge_best_hyperparameters_into_doc,
)


class TestHpsMerge(unittest.TestCase):
    def test_merge_resolves_filter_set_key(self) -> None:
        doc: dict = {"model": {"filters": [30, 40], "kernel_size": 3}}
        best = {
            "filters": "set2",
            "kernel_size": 7,
            "dropout_rate": 0.4,
            "batch_size": 64,
            "lstm_units": 64,
        }
        hps = {
            "filters": {
                "set1": [10, 20],
                "set2": [20, 30, 40, 50],
            }
        }
        changed = _merge_best_hyperparameters_into_doc(doc, best, hps)
        self.assertEqual(doc["model"]["filters"], [20, 30, 40, 50])
        self.assertEqual(doc["model"]["kernel_size"], 7)
        self.assertEqual(doc["model"]["dropout_rate"], 0.4)
        self.assertEqual(doc["model"]["lstm_units"], 64)
        self.assertTrue(any("filters" in c for c in changed))

    def test_apply_uses_temp_copy_without_rewriting_project_parameter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            best_dir = root / "hpsearch" / "hps_logs"
            best_dir.mkdir(parents=True)
            (best_dir / "best_hyperparameters.json").write_text(
                json.dumps(
                    {
                        "filters": "set1",
                        "kernel_size": 5,
                        "dropout_rate": 0.3,
                        "batch_size": 64,
                        "lstm_units": 128,
                    }
                ),
                encoding="utf-8",
            )
            hps = root / "demo_hps_parameter.json"
            hps.write_text(
                json.dumps(
                    {
                        "filters": {
                            "set1": [10, 20, 30, 40],
                            "set2": [20, 30, 40, 50],
                        }
                    }
                ),
                encoding="utf-8",
            )
            param = root / "orcai_parameter.json"
            original = {
                "name": "demo",
                "model": {
                    "filters": [30, 40, 50, 60],
                    "kernel_size": 3,
                    "dropout_rate": 0.5,
                    "batch_size": 64,
                    "lstm_units": 128,
                },
            }
            param.write_text(json.dumps(original), encoding="utf-8")
            out = _apply_best_hyperparameters_before_train(
                param,
                project_dir=root,
                hps_parameter_path=hps,
                msgr=None,
            )
            self.assertIsInstance(out, str)
            out_path = Path(str(out))
            self.assertTrue(out_path.is_file())
            self.assertNotEqual(out_path.resolve(), param.resolve())
            merged = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(merged["model"]["filters"], [10, 20, 30, 40])
            self.assertEqual(merged["model"]["kernel_size"], 5)
            self.assertEqual(merged["model"]["dropout_rate"], 0.3)
            # Project on-disk -p must stay untouched (orcAI CLI fidelity).
            self.assertEqual(
                json.loads(param.read_text(encoding="utf-8")),
                original,
            )

    def test_apply_noop_without_best_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            param = root / "orcai_parameter.json"
            original = {"model": {"kernel_size": 3}}
            param.write_text(json.dumps(original), encoding="utf-8")
            _apply_best_hyperparameters_before_train(
                param,
                project_dir=root,
                hps_parameter_path=None,
                msgr=None,
            )
            self.assertEqual(
                json.loads(param.read_text(encoding="utf-8")),
                original,
            )

    def test_find_best_json_under_hidden_parent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / ".secret" / "Fjord"
            best = project / "hpsearch" / "run1" / "best_hyperparameters.json"
            best.parent.mkdir(parents=True)
            best.write_text("{}", encoding="utf-8")
            found = _find_best_hyperparameters_json(project)
            self.assertIsNotNone(found)
            assert found is not None
            self.assertEqual(found.resolve(), best.resolve())


if __name__ == "__main__":
    unittest.main()
