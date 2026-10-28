"""filter-predictions adapter parameter resolution + CSV batch helpers."""

from __future__ import annotations

import csv
import json
import os
import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.adapters.predict import (
    PREDICT_SELECTION_CSV_NAME,
    _collect_csv_batch_files,
    _normalize_recording_names,
    predict_selection_csv_path,
    prepare_predict_recording_path,
    resolve_call_duration_limits,
    resolve_csv_batch_label_path,
    sanitize_csv_base_dir_recording,
)


class TestResolveCallDurationLimits(unittest.TestCase):
    def test_absent_key_keeps_engine_default(self) -> None:
        self.assertIsNone(resolve_call_duration_limits({}))

    def test_explicit_param_wins(self) -> None:
        path = resolve_call_duration_limits({"call_duration_limits": "/custom/limits.json"})
        self.assertEqual(path, "/custom/limits.json")

    def test_null_keeps_engine_default(self) -> None:
        """PRED-01/02: explicit null must not inject project/package limits."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            limits = root / "my_study_call_duration_limits.json"
            limits.write_text(json.dumps({"default": [0, None]}), encoding="utf-8")
            self.assertIsNone(
                resolve_call_duration_limits(
                    {"project_dir": str(root), "call_duration_limits": None}
                )
            )

    def test_project_sentinel_globs_limits_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            limits = root / "my_study_call_duration_limits.json"
            limits.write_text(json.dumps({"default": [0, None]}), encoding="utf-8")
            path = resolve_call_duration_limits(
                {"project_dir": str(root), "call_duration_limits": "project"}
            )
            self.assertEqual(path, str(limits.resolve()))


class TestCsvPredictBatchHelpers(unittest.TestCase):
    def test_normalize_recording_names_strips_wav(self) -> None:
        self.assertEqual(
            _normalize_recording_names(["a.wav", "b", "a.wav"]),
            ["a", "b"],
        )

    def test_prepare_predict_recording_path_filters_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            with table.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "recording",
                        "channel",
                        "rel_recording_path",
                    ],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "recording": "a",
                        "channel": "1",
                        "rel_recording_path": "recordings/a.wav",
                    }
                )
                writer.writerow(
                    {
                        "recording": "b",
                        "channel": "1",
                        "rel_recording_path": "recordings/b.wav",
                    }
                )
                writer.writerow(
                    {
                        "recording": "c",
                        "channel": "2",
                        "rel_recording_path": "recordings/c.wav",
                    }
                )

            filtered, temp = prepare_predict_recording_path(
                table,
                recording_names=["a", "c"],
                job_id="job1",
                project_dir=str(root),
            )
            self.assertIsNone(temp)
            self.assertEqual(filtered.name, PREDICT_SELECTION_CSV_NAME)
            self.assertEqual(filtered, predict_selection_csv_path(root))
            self.assertTrue(filtered.is_file())
            with filtered.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([r["recording"] for r in rows], ["a", "c"])

    def test_prepare_predict_recording_path_rejects_missing_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            table.write_text(
                "recording,channel,rel_recording_path\na,1,recordings/a.wav\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                prepare_predict_recording_path(
                    table,
                    recording_names=["a", "missing"],
                    job_id="job2",
                    project_dir=str(root),
                )

    def test_sanitize_csv_base_dir_drops_foreign_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rec = root / "recordings"
            rec.mkdir()
            foreign = root / "other" / "recordings"
            foreign.mkdir(parents=True)
            warnings: list[str] = []
            out = sanitize_csv_base_dir_recording(
                {
                    "recording_path": str(root / "recording_table.csv"),
                    "base_dir_recording": str(foreign),
                },
                is_csv=True,
                project_dir=str(root),
                warn=warnings.append,
            )
            self.assertNotIn("base_dir_recording", out)
            self.assertTrue(any("outside this project" in w for w in warnings))

    def test_sanitize_csv_base_dir_keeps_project_recordings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rec = root / "recordings"
            rec.mkdir()
            out = sanitize_csv_base_dir_recording(
                {"base_dir_recording": str(rec)},
                is_csv=True,
                project_dir=str(root),
            )
            self.assertEqual(out.get("base_dir_recording"), str(rec))

    def test_csv_custom_output_dir_matches_orcai_naming(self) -> None:
        path = resolve_csv_batch_label_path(
            wav_path=Path("/rec/a.wav"),
            stem="a",
            channel=2,
            model_dir=Path("/models/orcai-isl-v1"),
            output_param="/out",
        )
        self.assertEqual(path, Path("/out/a_orcai-isl-v1_predicted.txt").resolve())

    def test_prepare_predict_recording_path_matches_wav_extension_in_cell(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            table.write_text(
                "recording,channel,rel_recording_path\n"
                "a.wav,1,recordings/a.wav\n"
                "b,1,recordings/b.wav\n",
                encoding="utf-8",
            )
            filtered, temp = prepare_predict_recording_path(
                table,
                recording_names=["a"],
                job_id="job-ext",
                project_dir=str(root),
            )
            self.assertIsNone(temp)
            self.assertEqual(filtered.name, PREDICT_SELECTION_CSV_NAME)
            with filtered.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([r["recording"] for r in rows], ["a.wav"])

    def test_prepare_predict_recording_path_full_table_keeps_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            table.write_text(
                "recording,channel\na,1\nb,1\n",
                encoding="utf-8",
            )
            filtered, temp = prepare_predict_recording_path(
                table,
                recording_names=["a", "b"],
                job_id="job-all",
                project_dir=str(root),
            )
            self.assertIsNone(temp)
            self.assertEqual(filtered, table)

    def test_run_predict_cli_params_keep_prepared_recording_path(self) -> None:
        from inspect import getsource

        from orcai_desktop_sidecar.adapters.predict import run_predict

        src = getsource(run_predict)
        self.assertNotIn("recording_path=str(source)", src)
        self.assertIn("cli_params_from_engine(kwargs)", src)


class TestCsvBatchMtime(unittest.TestCase):
    def test_old_label_is_preexisting_when_min_mtime_set(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out_dir = root / "labels"
            out_dir.mkdir()
            table = root / "recording_table.csv"
            with table.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["recording", "channel"],
                )
                writer.writeheader()
                writer.writerow({"recording": "old", "channel": "1"})
                writer.writerow({"recording": "new", "channel": "1"})
            old_label = out_dir / "old_orcai-isl-v1_predicted.txt"
            new_label = out_dir / "new_orcai-isl-v1_predicted.txt"
            old_label.write_text("x", encoding="utf-8")
            new_label.write_text("y", encoding="utf-8")
            now = old_label.stat().st_mtime
            os.utime(old_label, (now - 120, now - 120))
            rows = _collect_csv_batch_files(
                table,
                model_dir=Path("/models/orcai-isl-v1"),
                output_param=str(out_dir),
                project_dir=str(root),
                min_mtime=now - 5,
            )
            by_stem = {row["recording"]: row["status"] for row in rows}
            self.assertEqual(by_stem["old"], "preexisting")
            self.assertEqual(by_stem["new"], "completed")

    def test_label_just_before_job_start_is_preexisting(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out_dir = root / "labels"
            out_dir.mkdir()
            table = root / "recording_table.csv"
            table.write_text("recording,channel\nstale,1\n", encoding="utf-8")
            label = out_dir / "stale_orcai-isl-v1_predicted.txt"
            label.write_text("x", encoding="utf-8")
            job_started = label.stat().st_mtime
            os.utime(label, (job_started - 0.2, job_started - 0.2))
            rows = _collect_csv_batch_files(
                table,
                model_dir=Path("/models/orcai-isl-v1"),
                output_param=str(out_dir),
                project_dir=str(root),
                min_mtime=job_started,
            )
            self.assertEqual(rows[0]["status"], "preexisting")


if __name__ == "__main__":
    unittest.main()
