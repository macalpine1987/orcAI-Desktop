"""Project results summary from orcAI label files."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.adapters.results_summary import (
    _thresholds_from_jobs,
    build_results_summary,
    is_annotation_label_name,
    is_filtered_label_name,
    is_predicted_label_name,
    parse_label_filename,
    rows_to_audacity_text,
    rows_to_csv,
)


def _preview(segments: list[dict[object, object]]) -> dict[str, object]:
    return {"segments": segments}


class TestLabelNameKind(unittest.TestCase):
    def test_predicted_vs_filtered_names(self) -> None:
        self.assertTrue(is_predicted_label_name("clip_c1_orcai-isl-v1_predicted.txt"))
        self.assertFalse(is_predicted_label_name("clip_c1_orcai-isl-v1_predicted_filtered.txt"))
        self.assertTrue(is_filtered_label_name("clip_c1_orcai-isl-v1_predicted_filtered.txt"))
        self.assertFalse(is_filtered_label_name("clip_c1_orcai-isl-v1_predicted.txt"))
        self.assertTrue(is_annotation_label_name("clip.txt"))
        self.assertFalse(is_annotation_label_name("clip_c1_orcai-isl-v1_predicted.txt"))

    def test_parse_channel_and_model(self) -> None:
        meta = parse_label_filename("fjord_c2_orcai-nor-v1_predicted.txt")
        self.assertEqual(meta["stem"], "fjord")
        self.assertEqual(meta["channel"], 2)
        self.assertEqual(meta["model"], "orcai-nor-v1")


class TestBuildResultsSummary(unittest.TestCase):
    def test_aggregates_mean_p_and_duration_from_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rec = root / "recordings"
            rec.mkdir()
            (rec / "clip_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            (rec / "clip_c1_orcai-isl-v1_predicted_filtered.txt").write_text(
                "y\n", encoding="utf-8"
            )

            def fake_preview(path: str | Path, **_kwargs: object) -> dict[str, object]:
                name = Path(path).name
                if name.endswith("_predicted_filtered.txt"):
                    return _preview(
                        [
                            {
                                "label": "WHISTLE",
                                "start_sec": 0.0,
                                "stop_sec": 1.0,
                                "mean_p": 0.80,
                            }
                        ]
                    )
                return _preview(
                    [
                        {
                            "label": "WHISTLE",
                            "start_sec": 0.0,
                            "stop_sec": 1.0,
                            "mean_p": 0.80,
                        },
                        {
                            "label": "BUZZ",
                            "start_sec": 2.0,
                            "stop_sec": 3.5,
                            "mean_p": 0.40,
                        },
                    ]
                )

            with (
                patch(
                    "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                    side_effect=fake_preview,
                ),
                patch(
                    "orcai_desktop_sidecar.adapters.results_summary._thresholds_from_jobs",
                    return_value=[0.5],
                ),
            ):
                predicted = build_results_summary(root, source="predicted")
                filtered = build_results_summary(root, source="filtered")

        self.assertEqual(predicted["summary"]["detection_count"], 2)
        self.assertEqual(predicted["summary"]["recording_count"], 1)
        self.assertAlmostEqual(predicted["summary"]["duration_sec"], 2.5)
        self.assertAlmostEqual(predicted["summary"]["mean_p"], 0.6)
        self.assertEqual(predicted["summary"]["models"], ["orcai-isl-v1"])
        self.assertEqual(predicted["summary"]["thresholds"], [0.5])
        self.assertEqual(filtered["summary"]["detection_count"], 1)
        labels = {row["label"] for row in predicted["rows"]}
        self.assertEqual(labels, {"WHISTLE", "BUZZ"})
        self.assertEqual(predicted["rows"][0]["kind"], "predicted")

    def test_annotations_source_reads_annotations_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ann = root / "annotations"
            ann.mkdir()
            (ann / "clip.txt").write_text("x\n", encoding="utf-8")
            (ann / "clip_c1_orcai-isl-v1_predicted.txt").write_text("skip\n", encoding="utf-8")
            with patch(
                "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                return_value=_preview(
                    [
                        {
                            "label": "WHISTLE",
                            "start_sec": 0.0,
                            "stop_sec": 1.2,
                            "mean_p": None,
                        }
                    ]
                ),
            ):
                out = build_results_summary(root, source="annotations")
        self.assertEqual(out["files_total"], 1)
        self.assertEqual(out["summary"]["detection_count"], 1)
        self.assertEqual(out["rows"][0]["kind"], "annotation")
        self.assertEqual(out["rows"][0]["recording"], "clip.wav")

    def test_source_switch_ignores_the_other_kind(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            with patch(
                "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                return_value=_preview(
                    [
                        {
                            "label": "WHISTLE",
                            "start_sec": 0.0,
                            "stop_sec": 0.2,
                            "mean_p": 0.9,
                        }
                    ]
                ),
            ):
                predicted = build_results_summary(root, source="predicted")
                filtered = build_results_summary(root, source="filtered")
        self.assertEqual(predicted["files_total"], 1)
        self.assertEqual(filtered["files_total"], 0)
        self.assertEqual(filtered["summary"]["detection_count"], 0)

    def test_bad_label_file_does_not_fail_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ok_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            (root / "bad_c1_orcai-isl-v1_predicted.txt").write_text("y\n", encoding="utf-8")

            def fake_preview(path: str | Path, **_kwargs: object) -> dict[str, object]:
                if Path(path).name.startswith("bad_"):
                    raise ValueError("corrupt labels")
                return _preview(
                    [
                        {
                            "label": "WHISTLE",
                            "start_sec": 0.0,
                            "stop_sec": 0.5,
                            "mean_p": 0.9,
                        }
                    ]
                )

            with patch(
                "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                side_effect=fake_preview,
            ):
                out = build_results_summary(root, source="predicted")
        self.assertEqual(out["files_ok"], 1)
        self.assertEqual(out["files_failed"], 1)
        self.assertEqual(out["summary"]["detection_count"], 1)

    def test_duplicate_segments_get_unique_row_ids(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clip_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            seg = {
                "label": "WHISTLE",
                "start_sec": 1.0,
                "stop_sec": 2.0,
                "mean_p": 0.9,
            }
            with patch(
                "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                return_value=_preview([seg, seg]),
            ):
                out = build_results_summary(root, source="predicted")
        ids = [row["id"] for row in out["rows"]]
        self.assertEqual(len(ids), 2)
        self.assertEqual(len(set(ids)), 2)

    def test_nested_files_and_all_segments_are_included(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            nested = root / "recordings" / "day2"
            nested.mkdir(parents=True)
            (root / "alpha_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            (nested / "zeta_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")
            (nested / "beta_c1_orcai-isl-v1_predicted.txt").write_text("x\n", encoding="utf-8")

            def fake_preview(_path: str | Path, **_kwargs: object) -> dict[str, object]:
                return _preview(
                    [
                        {
                            "label": "WHISTLE",
                            "start_sec": 0.0,
                            "stop_sec": 0.2,
                            "mean_p": 0.9,
                        },
                        {
                            "label": "BUZZ",
                            "start_sec": 1.0,
                            "stop_sec": 1.2,
                            "mean_p": 0.8,
                        },
                    ]
                )

            with patch(
                "orcai_desktop_sidecar.adapters.results_summary._preview_label_file",
                side_effect=fake_preview,
            ):
                out = build_results_summary(root, source="predicted")
        self.assertFalse(out["truncated"])
        self.assertEqual(out["files_total"], 3)
        self.assertEqual(out["files_ok"], 3)
        self.assertEqual(len(out["rows"]), 6)
        self.assertEqual(out["summary"]["detection_count"], 6)
        self.assertEqual(
            {row["recording"] for row in out["rows"]},
            {"alpha.wav", "zeta.wav", "beta.wav"},
        )


class TestThresholdsFromJobs(unittest.TestCase):
    def test_thresholds_ignore_other_projects(self) -> None:
        class FakeJob:
            def __init__(self, project: str, threshold: float) -> None:
                self.command = "predict"
                self.params = {"project_dir": project, "threshold": threshold}

        with tempfile.TemporaryDirectory() as tmp:
            mine = Path(tmp) / "mine"
            other = Path(tmp) / "other"
            fresh = Path(tmp) / "fresh"
            mine.mkdir()
            other.mkdir()
            fresh.mkdir()
            jobs = [
                FakeJob(str(other), 0.80),
                FakeJob(str(mine), 0.50),
                FakeJob("/unrelated", 0.90),
            ]
            with patch("orcai_desktop_sidecar.jobs.list_jobs", return_value=jobs):
                self.assertEqual(_thresholds_from_jobs(str(mine)), [0.5])
                self.assertEqual(_thresholds_from_jobs(str(other)), [0.8])
                self.assertEqual(_thresholds_from_jobs(str(fresh)), [])


class TestExportHelpers(unittest.TestCase):
    def test_csv_contains_only_given_rows(self) -> None:
        csv_text = rows_to_csv(
            [
                {
                    "recording": "a.wav",
                    "label": "WHISTLE",
                    "start_sec": 1.0,
                    "stop_sec": 2.0,
                    "duration_sec": 1.0,
                    "mean_p": 0.7,
                    "model": "orcai-isl-v1",
                    "label_path": "/p/a_predicted.txt",
                }
            ]
        )
        self.assertIn("recording,class,start_sec", csv_text)
        self.assertIn("a.wav", csv_text)
        self.assertIn("WHISTLE", csv_text)
        self.assertEqual(len(csv_text.strip().splitlines()), 2)

    def test_audacity_tab_labels(self) -> None:
        text = rows_to_audacity_text(
            [
                {
                    "start_sec": 1.25,
                    "stop_sec": 2.5,
                    "label": "WHISTLE",
                }
            ]
        )
        first = text.strip().splitlines()[0].split("\t")
        self.assertEqual(len(first), 3)
        self.assertEqual(first[2], "WHISTLE")
        self.assertAlmostEqual(float(first[0]), 1.25)
        self.assertAlmostEqual(float(first[1]), 2.5)


if __name__ == "__main__":
    unittest.main()
