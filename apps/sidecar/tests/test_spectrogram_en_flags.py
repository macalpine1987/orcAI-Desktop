"""Stage 3: create-spectrograms -en/-enp preflight (no silent 0-spectrogram success)."""

from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd

from orcai_desktop_sidecar.adapters.training import (
    count_spectrogram_eligible_rows,
    reject_empty_spectrogram_selection,
    run_create_spectrograms,
)
from orcai_desktop_sidecar.cli_command import build_command_line


def _write_table(path: Path, rows: list[dict[str, object]]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


def _param(path: Path, calls: list[str] | None = None) -> Path:
    doc = {
        "name": "t",
        "calls": calls or ["WHISTLE", "BUZZ"],
        "spectrogram": {"nfft": 1024, "hop_length": 256, "freq_min": 0, "freq_max": 16000},
    }
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


def _stub_create_spectrograms(spy):
    """Avoid importing real orcai.spectrogram (librosa/numba) when patching the engine."""
    fake = types.ModuleType("orcai.spectrogram")
    fake.create_spectrograms = spy
    return patch.dict(sys.modules, {"orcai.spectrogram": fake})


class SpectrogramEligibleCountTests(unittest.TestCase):
    def test_all_unannotated_excluded_without_en(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": None,
                        "rel_annotation_path": None,
                        "WHISTLE": True,
                        "BUZZ": True,
                    }
                ],
            )
            param = _param(root / "p.json")
            counts = count_spectrogram_eligible_rows(
                table,
                orcai_parameter=str(param),
                include_not_annotated=False,
            )
            self.assertEqual(counts["total"], 1)
            self.assertEqual(counts["eligible"], 0)
            self.assertEqual(counts["excluded_not_annotated"], 1)
            with self.assertRaisesRegex(ValueError, r"-en"):
                reject_empty_spectrogram_selection(
                    counts,
                    include_not_annotated=False,
                    include_no_possible_annotations=False,
                )

    def test_en_keeps_unannotated_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": None,
                        "WHISTLE": True,
                        "BUZZ": False,
                    }
                ],
            )
            param = _param(root / "p.json")
            counts = count_spectrogram_eligible_rows(
                table,
                orcai_parameter=str(param),
                include_not_annotated=True,
            )
            self.assertEqual(counts["eligible"], 1)
            reject_empty_spectrogram_selection(
                counts,
                include_not_annotated=True,
                include_no_possible_annotations=False,
            )

    def test_no_possible_classes_needs_enp(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": str(root / "ann"),
                        "rel_annotation_path": "a.txt",
                        "WHISTLE": False,
                        "BUZZ": False,
                    }
                ],
            )
            param = _param(root / "p.json")
            counts = count_spectrogram_eligible_rows(
                table,
                orcai_parameter=str(param),
                include_not_annotated=False,
                include_no_possible_annotations=False,
            )
            self.assertEqual(counts["eligible"], 0)
            self.assertEqual(counts["excluded_no_possible"], 1)
            with self.assertRaisesRegex(ValueError, r"-enp"):
                reject_empty_spectrogram_selection(
                    counts,
                    include_not_annotated=False,
                    include_no_possible_annotations=False,
                )


class RunCreateSpectrogramsEnTests(unittest.TestCase):
    def test_job_fails_before_orcai_when_nothing_eligible(self) -> None:
        called: list[str] = []

        def spy(
            recording_table_path,
            output_dir,
            base_dir_recording=None,
            orcai_parameter=None,
            include_not_annotated=False,
            include_no_possible_annotations=False,
            overwrite=False,
            verbosity=2,
            msgr=None,
        ) -> None:
            del (
                recording_table_path,
                output_dir,
                base_dir_recording,
                orcai_parameter,
                include_not_annotated,
                include_no_possible_annotations,
                overwrite,
                verbosity,
                msgr,
            )
            called.append("run")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "solo",
                        "base_dir_annotation": None,
                        "WHISTLE": True,
                        "BUZZ": True,
                    }
                ],
            )
            param = _param(root / "p.json")
            msgr = MagicMock()
            with (
                _stub_create_spectrograms(spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._messenger",
                    return_value=msgr,
                ),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._reject_orcai_parameter",
                ),
                self.assertRaisesRegex(ValueError, r"No recordings left"),
            ):
                run_create_spectrograms(
                    "job-spec",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                        "orcai_parameter": str(param),
                    },
                )
        self.assertEqual(called, [])

    def test_en_flag_reaches_engine(self) -> None:
        seen: dict[str, object] = {}

        def spy(
            recording_table_path,
            output_dir,
            base_dir_recording=None,
            orcai_parameter=None,
            include_not_annotated=False,
            include_no_possible_annotations=False,
            overwrite=False,
            verbosity=2,
            msgr=None,
        ) -> None:
            seen["include_not_annotated"] = include_not_annotated
            seen["include_no_possible_annotations"] = include_no_possible_annotations
            del recording_table_path, output_dir, base_dir_recording, orcai_parameter
            del overwrite, verbosity, msgr

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "solo",
                        "base_dir_annotation": None,
                        "WHISTLE": True,
                        "BUZZ": True,
                    }
                ],
            )
            param = _param(root / "p.json")
            msgr = MagicMock()
            with (
                _stub_create_spectrograms(spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._messenger",
                    return_value=msgr,
                ),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._reject_orcai_parameter",
                ),
            ):
                result = run_create_spectrograms(
                    "job-spec",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                        "orcai_parameter": str(param),
                        "include_not_annotated": True,
                    },
                )
        self.assertTrue(seen.get("include_not_annotated"))
        self.assertTrue(result["include_not_annotated"])
        self.assertEqual(result["eligible_rows"], 1)

    def test_enp_flag_reaches_engine(self) -> None:
        seen: dict[str, object] = {}

        def spy(
            recording_table_path,
            output_dir,
            base_dir_recording=None,
            orcai_parameter=None,
            include_not_annotated=False,
            include_no_possible_annotations=False,
            overwrite=False,
            verbosity=2,
            msgr=None,
        ) -> None:
            seen["include_not_annotated"] = include_not_annotated
            seen["include_no_possible_annotations"] = include_no_possible_annotations
            del recording_table_path, output_dir, base_dir_recording, orcai_parameter
            del overwrite, verbosity, msgr

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "solo",
                        "base_dir_annotation": str(root / "ann"),
                        "WHISTLE": False,
                        "BUZZ": False,
                    }
                ],
            )
            param = _param(root / "p.json")
            msgr = MagicMock()
            with (
                _stub_create_spectrograms(spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._messenger",
                    return_value=msgr,
                ),
                patch(
                    "orcai_desktop_sidecar.adapters.training_spectrograms._reject_orcai_parameter",
                ),
            ):
                result = run_create_spectrograms(
                    "job-spec",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                        "orcai_parameter": str(param),
                        "include_no_possible_annotations": True,
                    },
                )
        self.assertTrue(seen.get("include_no_possible_annotations"))
        self.assertTrue(result["include_no_possible_annotations"])
        self.assertEqual(result["eligible_rows"], 1)

    def test_cli_emits_en_when_true(self) -> None:
        line = build_command_line(
            "create-spectrograms",
            {
                "recording_table_path": "/t.csv",
                "output_dir": "/out",
                "include_not_annotated": True,
                "include_no_possible_annotations": True,
            },
        )
        self.assertIn("-en", line)
        self.assertIn("-enp", line)
        line_off = build_command_line(
            "create-spectrograms",
            {
                "recording_table_path": "/t.csv",
                "output_dir": "/out",
                "include_not_annotated": False,
            },
        )
        self.assertNotIn("-en", line_off)


if __name__ == "__main__":
    unittest.main()
