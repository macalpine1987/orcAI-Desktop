"""Model studio unit tests."""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path


class ModelStudioTests(unittest.TestCase):
    def test_project_parameter_path_prefers_folder_then_glob(self) -> None:
        from orcai_desktop_sidecar.model_studio import project_parameter_path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Fjord-Field-2026"
            root.mkdir()
            # display_name-style file must not win over folder name when both exist
            (root / "Pretty Label_orcai_parameter.json").write_text("{}", encoding="utf-8")
            folder_param = root / "Fjord-Field-2026_orcai_parameter.json"
            folder_param.write_text("{}", encoding="utf-8")
            self.assertEqual(project_parameter_path(root), folder_param)

            folder_param.unlink()
            # glob fallback (sorted): Pretty Label wins as only match
            found = project_parameter_path(root)
            self.assertIsNotNone(found)
            assert found is not None
            self.assertEqual(found.name, "Pretty Label_orcai_parameter.json")

            (root / "Pretty Label_orcai_parameter.json").unlink()
            self.assertIsNone(project_parameter_path(root))

    def _write_model(
        self,
        root: Path,
        name: str,
        *,
        calls: list[str],
        spectro: dict | None = None,
        with_test: bool = True,
        val_mba: list[float] | None = None,
    ) -> Path:
        model_dir = root / "models" / name
        model_dir.mkdir(parents=True)
        param = {
            "name": name,
            "calls": calls,
            "spectrogram": spectro
            or {
                "sampling_rate": 48000,
                "nfft": 1024,
                "n_overlap": 512,
                "freq_range": [0, 16000],
                "quantiles": [0.05, 0.95],
                "duration": 0.2,
            },
            "architecture": "ResNetLSTM",
            "model": {"batch_size": 32},
        }
        (model_dir / "orcai_parameter.json").write_text(
            json.dumps(param), encoding="utf-8"
        )
        (model_dir / f"{name}.keras").write_bytes(b"fake-weights")
        (model_dir / "model_shape.json").write_text(
            json.dumps({"input": [None, 64, 64], "output": [None, 64, len(calls)]}),
            encoding="utf-8",
        )
        if val_mba is not None:
            (model_dir / "training_history.json").write_text(
                json.dumps(
                    {
                        "MBA": [0.5] * len(val_mba),
                        "val_MBA": val_mba,
                        "loss": [1.0] * len(val_mba),
                        "val_loss": [1.1] * len(val_mba),
                    }
                ),
                encoding="utf-8",
            )
        if with_test:
            test_dir = model_dir / "test"
            test_dir.mkdir()
            (test_dir / "test_data_metrics.json").write_text(
                json.dumps({"MBA": 0.82, "loss": 0.4}),
                encoding="utf-8",
            )
            with (test_dir / "test_data_confusion_table.csv").open(
                "w", newline="", encoding="utf-8"
            ) as fh:
                w = csv.DictWriter(
                    fh,
                    fieldnames=["Label", "TP", "FN", "FP", "TN", "PR", "RE", "F1", "Total"],
                )
                w.writeheader()
                for i, label in enumerate(calls):
                    w.writerow(
                        {
                            "Label": label,
                            "TP": 0.1,
                            "FN": 0.1,
                            "FP": 0.1,
                            "TN": 0.7,
                            "PR": 0.8 - i * 0.05,
                            "RE": 0.7 - i * 0.05,
                            "F1": 0.75 - i * 0.05,
                            "Total": 1000,
                        }
                    )
        return model_dir

    def test_list_enrichment_and_detail(self) -> None:
        from orcai_desktop_sidecar.model_studio import (
            get_model_detail,
            list_models_studio,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_model(
                root, "fjord", calls=["WHISTLE", "SS"], val_mba=[0.7, 0.81]
            )
            (root / "fjord_orcai_parameter.json").write_text(
                json.dumps(
                    {
                        "name": "fjord",
                        "calls": ["WHISTLE", "SS"],
                        "spectrogram": {
                            "sampling_rate": 48000,
                            "nfft": 1024,
                            "n_overlap": 512,
                            "freq_range": [0, 16000],
                            "quantiles": [0.05, 0.95],
                            "duration": 0.2,
                        },
                    }
                ),
                encoding="utf-8",
            )
            rows = list_models_studio(root)
            trained = [r for r in rows if r["kind"] == "trained"]
            self.assertEqual(len(trained), 1)
            self.assertEqual(trained[0]["class_count"], 2)
            self.assertAlmostEqual(trained[0]["val_mba"], 0.81)
            self.assertTrue(trained[0]["has_test"])
            self.assertGreater(trained[0]["size_bytes"], 0)

            detail = get_model_detail(str(trained[0]["path"]), root)
            self.assertEqual(detail["kind"], "trained")
            self.assertIsNotNone(detail["test"])
            self.assertAlmostEqual(detail["test"]["mba"], 0.82)
            self.assertEqual(len(detail["test"]["classes"]), 2)
            self.assertTrue(detail["compatibility"]["ok"])
            self.assertIn("snippets", detail)
            # _write_model puts duration under spectrogram — mirrored into snippets
            self.assertEqual(detail["snippets"].get("snippet_duration"), 0.2)
            names = {f["name"] for f in detail["files"]}
            self.assertIn("fjord.keras", names)
            self.assertIn("orcai_parameter.json", names)
            self.assertIn("test/", names)

    def test_compatibility_blocks_spectro_and_extra_class(self) -> None:
        from orcai_desktop_sidecar.model_studio import compare_compatibility

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_dir = self._write_model(
                root,
                "m1",
                calls=["WHISTLE"],
                spectro={
                    "sampling_rate": 48000,
                    "nfft": 1024,
                    "n_overlap": 512,
                    "freq_range": [0, 16000],
                    "quantiles": [0.05, 0.95],
                    "duration": 0.2,
                },
                with_test=False,
            )
            (root / "m1_orcai_parameter.json").write_text(
                json.dumps(
                    {
                        "name": "m1",
                        "calls": ["WHISTLE", "BIG"],
                        "spectrogram": {
                            "sampling_rate": 44100,
                            "nfft": 1024,
                            "n_overlap": 512,
                            "freq_range": [0, 16000],
                            "quantiles": [0.05, 0.95],
                            "duration": 0.2,
                        },
                    }
                ),
                encoding="utf-8",
            )
            result = compare_compatibility(model_dir, root)
            self.assertFalse(result["ok"])
            codes = {i["code"] for i in result["issues"]}
            self.assertIn("spectrogram_mismatch", codes)
            self.assertIn("class_not_in_model", codes)

    def test_import_model_directory(self) -> None:
        from orcai_desktop_sidecar.model_studio import import_model_directory

        with tempfile.TemporaryDirectory() as tmp:
            src_root = Path(tmp) / "src"
            dest_root = Path(tmp) / "proj"
            src_root.mkdir()
            dest_root.mkdir()
            src = self._write_model(src_root, "imported", calls=["SS"], with_test=False)
            out = import_model_directory(src, dest_root)
            self.assertEqual(out["model"]["name"], "imported")
            self.assertTrue((dest_root / "models" / "imported" / "orcai_parameter.json").is_file())

    def test_export_model_directory(self) -> None:
        from orcai_desktop_sidecar.model_studio import export_model_directory

        with tempfile.TemporaryDirectory() as tmp:
            proj = Path(tmp) / "proj"
            out_root = Path(tmp) / "out"
            proj.mkdir()
            out_root.mkdir()
            src = self._write_model(proj, "shippable", calls=["SS", "BR"], with_test=True)
            out = export_model_directory(str(src), out_root, project_dir=proj)
            dest = Path(out["path"])
            self.assertEqual(out["name"], "shippable")
            self.assertTrue((dest / "orcai_parameter.json").is_file())
            self.assertTrue((dest / "shippable.keras").is_file())
            self.assertTrue((dest / "test").is_dir())
            # Round-trip: import into another project
            from orcai_desktop_sidecar.model_studio import import_model_directory

            other = Path(tmp) / "other"
            other.mkdir()
            imported = import_model_directory(dest, other)
            self.assertEqual(imported["model"]["name"], "shippable")
            self.assertTrue(
                (other / "models" / "shippable" / "orcai_parameter.json").is_file()
            )

    def test_export_rejects_missing_dest(self) -> None:
        from orcai_desktop_sidecar.model_studio import export_model_directory

        with tempfile.TemporaryDirectory() as tmp:
            proj = Path(tmp) / "proj"
            proj.mkdir()
            src = self._write_model(proj, "x", calls=["SS"], with_test=False)
            with self.assertRaises(FileNotFoundError):
                export_model_directory(str(src), Path(tmp) / "nope", project_dir=proj)

    def test_confusion_csv_keeps_each_row(self) -> None:
        from orcai_desktop_sidecar.model_studio import _parse_confusion_csv

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "confusion.csv"
            with path.open("w", encoding="utf-8", newline="") as fh:
                writer = csv.DictWriter(
                    fh,
                    fieldnames=["Label", "PR", "RE", "F1", "TP", "FN", "FP", "TN", "Total"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "Label": "WH",
                        "PR": "0.10",
                        "RE": "0.20",
                        "F1": "0.30",
                        "TP": "1",
                        "FN": "2",
                        "FP": "3",
                        "TN": "4",
                        "Total": "10",
                    }
                )
                writer.writerow(
                    {
                        "Label": "SS",
                        "PR": "0.90",
                        "RE": "0.80",
                        "F1": "0.70",
                        "TP": "9",
                        "FN": "8",
                        "FP": "7",
                        "TN": "6",
                        "Total": "30",
                    }
                )
            rows = _parse_confusion_csv(path)
            self.assertEqual([row["label"] for row in rows], ["WH", "SS"])
            self.assertAlmostEqual(rows[0]["precision"], 0.10)
            self.assertAlmostEqual(rows[1]["precision"], 0.90)
            self.assertEqual(rows[0]["total"], 10)
            self.assertEqual(rows[1]["total"], 30)


if __name__ == "__main__":
    unittest.main()
