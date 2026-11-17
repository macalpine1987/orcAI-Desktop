"""create-label-arrays skips rows whose .txt is not in the shared folder."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from orcai_desktop_sidecar.adapters.training import (
    annotation_table_skipping_missing_txt,
    resolve_call_equivalences_for_engine,
    run_create_label_arrays,
)
from orcai_desktop_sidecar.cli_command import build_command_line, normalize_job_params

_MISSING = object()


class CallEquivalencesResolveTests(unittest.TestCase):
    """Stage 2: no silent identity map from orcai_parameter.calls."""

    def test_none_without_fallback_stays_none(self) -> None:
        prepared, note = resolve_call_equivalences_for_engine(
            {"call_equivalences": None, "orcai_parameter": {"calls": ["WHISTLE"]}},
            fallback=None,
        )
        self.assertIsNone(prepared.get("call_equivalences"))
        self.assertIsNone(note)

    def test_none_with_explicit_fallback_uses_fallback(self) -> None:
        fallback = {"Buzz3": "BUZZ"}
        prepared, note = resolve_call_equivalences_for_engine(
            {"call_equivalences": None},
            fallback=fallback,
        )
        self.assertEqual(prepared["call_equivalences"], fallback)
        self.assertIsNotNone(note)

    def test_missing_file_without_fallback_keeps_path(self) -> None:
        prepared, note = resolve_call_equivalences_for_engine(
            {
                "call_equivalences": "/no/such/call_equivalences.json",
                "orcai_parameter": {"calls": ["WHISTLE", "BUZZ"]},
            },
            fallback=None,
        )
        self.assertEqual(
            prepared["call_equivalences"],
            "/no/such/call_equivalences.json",
        )
        self.assertIsNone(note)
        # Must not invent {WHISTLE: WHISTLE, …}.
        self.assertNotIsInstance(prepared["call_equivalences"], dict)

    def test_missing_file_with_fallback_uses_fallback(self) -> None:
        fallback = {"WHISTLE": "WHISTLE"}
        prepared, note = resolve_call_equivalences_for_engine(
            {"call_equivalences": "/missing.json"},
            fallback=fallback,
        )
        self.assertEqual(prepared["call_equivalences"], fallback)
        self.assertIsNotNone(note)

    def test_fallback_stripped_from_cli_line(self) -> None:
        n = normalize_job_params(
            "create-label-arrays",
            {
                "recording_table_path": "/t.csv",
                "output_dir": "/out",
                "call_equivalences": "/ce.json",
                "call_equivalences_fallback": {"A": "A"},
            },
        )
        self.assertNotIn("call_equivalences_fallback", n)
        line = build_command_line(
            "create-label-arrays",
            {
                "recording_table_path": "/t.csv",
                "output_dir": "/out",
                "call_equivalences": "/ce.json",
                "call_equivalences_fallback": {"A": "A"},
            },
        )
        self.assertIn("-ce", line)
        self.assertNotIn("call_equivalences_fallback", line)
        self.assertNotIn("fallback", line)


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("start\tstop\tlabel\n", encoding="utf-8")


def _write_table(path: Path, rows: list[dict[str, object]]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


class AnnotationTableSkipTests(unittest.TestCase):
    def test_every_txt_in_shared_folder_keeps_the_project_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            _touch(shared / "a.txt")
            _touch(shared / "b.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "a.txt",
                        "whistles": True,
                    },
                    {
                        "recording": "b",
                        "base_dir_annotation": "",
                        "rel_annotation_path": "b.txt",
                        "whistles": True,
                    },
                ],
            )
            before = table.read_bytes()
            self.assertIsNone(annotation_table_skipping_missing_txt(table, shared))
            self.assertEqual(table.read_bytes(), before)

    def test_missing_txt_and_outside_folder_use_a_temp_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            own = root / "other"
            _touch(shared / "kept.txt")
            _touch(shared / "rec1.txt")
            _touch(own / "note.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "kept",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "kept.txt",
                        "whistles": False,
                        "bursts": True,
                    },
                    {
                        "recording": "rec1",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "missing.txt",
                        "whistles": "",
                        "bursts": False,
                    },
                    {
                        "recording": "note",
                        "base_dir_annotation": str(own),
                        "rel_annotation_path": "note.txt",
                        "whistles": True,
                        "bursts": "",
                    },
                    {
                        "recording": "blank",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "",
                        "whistles": "",
                        "bursts": "",
                    },
                ],
            )
            before = table.read_bytes()
            temp = annotation_table_skipping_missing_txt(table, shared)
            try:
                self.assertIsNotNone(temp)
                assert temp is not None
                self.assertTrue(temp.name.startswith("orcai-label-table-"))
                self.assertTrue(temp.name.endswith(".csv"))
                self.assertNotEqual(temp.resolve(), table.resolve())
                got = pd.read_csv(temp)
            finally:
                if temp is not None:
                    temp.unlink(missing_ok=True)
            self.assertEqual(table.read_bytes(), before)
            self.assertEqual(got.loc[0, "base_dir_annotation"], str(shared))
            self.assertEqual(bool(got.loc[0, "whistles"]), False)
            self.assertTrue(pd.isna(got.loc[1, "base_dir_annotation"]))
            self.assertEqual(got.loc[1, "rel_annotation_path"], "missing.txt")
            self.assertTrue(pd.isna(got.loc[1, "whistles"]))
            self.assertEqual(bool(got.loc[1, "bursts"]), False)
            self.assertEqual(got.loc[2, "base_dir_annotation"], str(own))
            self.assertEqual(got.loc[2, "rel_annotation_path"], "note.txt")
            self.assertTrue(pd.isna(got.loc[2, "bursts"]))
            self.assertTrue(pd.isna(got.loc[3, "base_dir_annotation"]))
            self.assertTrue(pd.isna(got.loc[3, "rel_annotation_path"]))

    def test_wav_stem_file_does_not_count_as_the_row_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            _touch(shared / "rec1.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "rec1",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "other.txt",
                    }
                ],
            )
            temp = annotation_table_skipping_missing_txt(table, shared)
            try:
                self.assertIsNotNone(temp)
                assert temp is not None
                got = pd.read_csv(temp)
            finally:
                if temp is not None:
                    temp.unlink(missing_ok=True)
            self.assertEqual(got.loc[0, "recording"], "rec1")
            self.assertEqual(got.loc[0, "rel_annotation_path"], "other.txt")
            self.assertTrue(pd.isna(got.loc[0, "base_dir_annotation"]))


class _Spy:
    def __init__(self, calls: list[dict[str, object]], *, fail: bool = False) -> None:
        self.calls = calls
        self.fail = fail

    def __call__(
        self,
        recording_table_path,
        output_dir,
        base_dir_annotation=_MISSING,
        orcai_parameter=None,
        call_equivalences=None,
        overwrite=False,
        verbosity=2,
        msgr=None,
    ):
        del output_dir, orcai_parameter, call_equivalences, overwrite, verbosity, msgr
        path = Path(str(recording_table_path))
        self.calls.append(
            {
                "recording_table_path": str(path),
                "exists": path.is_file(),
                "base_dir_annotation": base_dir_annotation,
            }
        )
        if self.fail:
            raise RuntimeError("label boom")


class RunCreateLabelArraysTableTests(unittest.TestCase):
    def _run(self, params: dict[str, object]) -> tuple[dict, list]:
        calls: list[dict[str, object]] = []
        spy = _Spy(calls)
        with (
            patch("orcai.labels.create_label_arrays", spy),
            patch(
                "orcai_desktop_sidecar.adapters.training_labels._messenger",
                return_value=object(),
            ),
        ):
            result = run_create_label_arrays("job-labels", params)
        return result, calls

    def test_shared_folder_keeps_bda_and_the_original_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            _touch(shared / "a.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "a.txt",
                    }
                ],
            )
            result, calls = self._run(
                {
                    "recording_table_path": str(table),
                    "output_dir": str(root / "out"),
                    "base_dir_annotation": str(shared),
                }
            )
            self.assertEqual(len(calls), 1)
            self.assertEqual(Path(calls[0]["recording_table_path"]).resolve(), table.resolve())
            self.assertEqual(calls[0]["base_dir_annotation"], str(shared))
            self.assertEqual(result["recording_table_path"], str(table.resolve()))
            self.assertEqual(result["cli_params"]["recording_table_path"], str(table))
            self.assertEqual(result["cli_params"]["base_dir_annotation"], str(shared))
            self.assertNotIn("msgr", result["cli_params"])

    def test_missing_txt_hides_temp_path_and_keeps_bda_on_the_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            _touch(shared / "rec1.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "rec1",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "missing.txt",
                        "whistles": False,
                    }
                ],
            )
            before = table.read_bytes()
            result, calls = self._run(
                {
                    "recording_table_path": str(table),
                    "output_dir": str(root / "out"),
                    "base_dir_annotation": str(shared),
                }
            )
            passed = Path(str(calls[0]["recording_table_path"]))
            self.assertTrue(calls[0]["exists"])
            self.assertTrue(passed.name.startswith("orcai-label-table-"))
            self.assertFalse(passed.exists())
            self.assertIs(calls[0]["base_dir_annotation"], _MISSING)
            self.assertEqual(result["recording_table_path"], str(table.resolve()))
            self.assertEqual(result["cli_params"]["recording_table_path"], str(table))
            self.assertEqual(result["cli_params"]["base_dir_annotation"], str(shared))
            self.assertEqual(table.read_bytes(), before)

    def test_own_folder_outside_shared_drops_bda_on_the_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            own = root / "other"
            _touch(own / "note.txt")
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "note",
                        "base_dir_annotation": str(own),
                        "rel_annotation_path": "note.txt",
                    }
                ],
            )
            before = table.read_bytes()
            seen: list[dict[str, object]] = []

            def spy(
                recording_table_path,
                output_dir,
                base_dir_annotation=_MISSING,
                orcai_parameter=None,
                call_equivalences=None,
                overwrite=False,
                verbosity=2,
                msgr=None,
            ) -> None:
                del output_dir, orcai_parameter, call_equivalences, overwrite, verbosity, msgr
                path = Path(str(recording_table_path))
                frame = pd.read_csv(path)
                seen.append(
                    {
                        "name": path.name,
                        "path": path,
                        "base": frame.loc[0, "base_dir_annotation"],
                        "rel": frame.loc[0, "rel_annotation_path"],
                        "bda": base_dir_annotation,
                    }
                )

            with (
                patch("orcai.labels.create_label_arrays", spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_labels._messenger",
                    return_value=object(),
                ),
            ):
                result = run_create_label_arrays(
                    "job-labels",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                        "base_dir_annotation": str(shared),
                    },
                )
            passed = seen[0]["path"]
            assert isinstance(passed, Path)
            self.assertTrue(str(seen[0]["name"]).startswith("orcai-label-table-"))
            self.assertFalse(passed.exists())
            self.assertEqual(seen[0]["base"], str(own))
            self.assertEqual(seen[0]["rel"], "note.txt")
            self.assertIs(seen[0]["bda"], _MISSING)
            self.assertEqual(result["cli_params"]["recording_table_path"], str(table))
            self.assertEqual(result["cli_params"]["base_dir_annotation"], str(shared))
            self.assertEqual(result["recording_table_path"], str(table.resolve()))
            self.assertEqual(table.read_bytes(), before)

    def test_failed_step_still_deletes_the_temp_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shared = root / "annotations"
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "rec1",
                        "base_dir_annotation": str(shared),
                        "rel_annotation_path": "missing.txt",
                    }
                ],
            )
            before = table.read_bytes()
            calls: list[dict[str, object]] = []
            spy = _Spy(calls, fail=True)
            with (
                patch("orcai.labels.create_label_arrays", spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_labels._messenger",
                    return_value=object(),
                ),
                self.assertRaises(RuntimeError),
            ):
                run_create_label_arrays(
                    "job-labels",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                        "base_dir_annotation": str(shared),
                    },
                )
            passed = Path(str(calls[0]["recording_table_path"]))
            self.assertTrue(passed.name.startswith("orcai-label-table-"))
            self.assertFalse(passed.exists())
            self.assertEqual(table.read_bytes(), before)

    def test_without_bda_the_project_table_is_passed_through(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            table = root / "recording_table.csv"
            _write_table(
                table,
                [
                    {
                        "recording": "a",
                        "base_dir_annotation": "",
                        "rel_annotation_path": "",
                    }
                ],
            )
            calls: list[dict[str, object]] = []
            spy = _Spy(calls)
            with (
                patch("orcai.labels.create_label_arrays", spy),
                patch(
                    "orcai_desktop_sidecar.adapters.training_labels._messenger",
                    return_value=object(),
                ),
                patch(
                    "orcai_desktop_sidecar.adapters.training.annotation_table_skipping_missing_txt"
                ) as helper,
            ):
                result = run_create_label_arrays(
                    "job-labels",
                    {
                        "recording_table_path": str(table),
                        "output_dir": str(root / "out"),
                    },
                )
            helper.assert_not_called()
            self.assertEqual(Path(calls[0]["recording_table_path"]).resolve(), table.resolve())
            self.assertIs(calls[0]["base_dir_annotation"], _MISSING)
            self.assertNotIn("base_dir_annotation", result["cli_params"])
