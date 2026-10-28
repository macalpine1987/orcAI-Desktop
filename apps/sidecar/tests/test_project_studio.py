"""Projects section: focus, recording table, annotations, artifacts, parameters."""

from __future__ import annotations

import csv
import json
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.project_registry import (
    compute_project_summary,
    create_project,
    delete_project,
    get_project,
    register_existing_project,
    set_project_focus,
)
from orcai_desktop_sidecar.project_studio import (
    TABLE_STANDARD_COLUMNS,
    annotations_matrix,
    append_annotation_calls,
    compute_data_health,
    delete_annotations,
    import_annotations,
    list_artifacts,
    orcai_parameter_defaults,
    read_parameters,
    read_recording_table,
    set_recording_channel,
    validate_parameters_text,
    write_parameters,
)
from orcai_desktop_sidecar.store import connect, get_project_focus_row


def _write_pcm16_wav(path: Path, *, frames: int = 4800, sample_rate: int = 48_000) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * frames, *([0] * frames)))


def _write_table(path: Path, rows: list[dict[str, str]], extra_columns: list[str]) -> None:
    columns = ["recording", *TABLE_STANDARD_COLUMNS[1:], *extra_columns]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({c: row.get(c, "") for c in columns})


def _read_table(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


PARAMETER_DOC = {
    "name": "demo",
    "architecture": "ResNetLSTM",
    "model": {"epochs": 1},
    "spectrogram": {
        "sampling_rate": 48000,
        "nfft": 512,
        "n_overlap": 256,
        "freq_range": [0, 16000],
        "quantiles": [0.01, 0.999],
        "duration": 4,
    },
    "calls": ["BR", "BUZZ", "WHISTLE"],
    "snippets": {},
    "seed": 1,
}


class ProjectStudioTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        self.parent = self._home / "projects"
        self.parent.mkdir()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def _project(self, name: str = "Demo", **kwargs) -> dict:
        return create_project(parent_dir=str(self.parent), display_name=name, **kwargs)

    def _init_parameters(self, project: dict, doc: dict | None = None) -> Path:
        path = Path(project["path"]) / f"{project['orcai_name']}_orcai_parameter.json"
        path.write_text(json.dumps(doc or PARAMETER_DOC, indent=4), encoding="utf-8")
        return path

    # ------------------------------------------------------------------ focus (FR-2.14/15)

    def test_focus_is_stored_only_in_desktop_sqlite(self) -> None:
        project = self._project(focus="training")
        self.assertEqual(project["focus"], "training")
        self.assertEqual(project["focus_source"], "stored")
        manifest = json.loads((Path(project["path"]) / "project.json").read_text())
        self.assertNotIn("focus", manifest)
        self.assertEqual(get_project_focus_row(connect(), project["id"]), "training")
        focus_file = Path(project["path"]) / ".orcai-desktop" / "desktop_focus.json"
        self.assertTrue(focus_file.is_file())

        switched = set_project_focus(project["id"], "full")
        self.assertEqual(switched["focus"], "full")
        summary = compute_project_summary(project["id"])
        self.assertEqual(summary["focus"], "full")
        self.assertEqual(summary["focus_source"], "stored")

        with self.assertRaises(ValueError):
            set_project_focus(project["id"], "predict-only")

        delete_project(project["id"])
        self.assertIsNone(get_project_focus_row(connect(), project["id"]))

    def test_cli_project_without_sqlite_row_opens_with_full_focus(self) -> None:
        cli_dir = self.parent / "cli_project"
        cli_dir.mkdir()
        (cli_dir / "cli_project_orcai_parameter.json").write_text(
            json.dumps(PARAMETER_DOC), encoding="utf-8"
        )
        project = register_existing_project(str(cli_dir))
        self.assertIsNone(project["focus"])
        self.assertEqual(project["focus_source"], "inferred")
        self.assertTrue(project["initialized"])
        summary = compute_project_summary(project["id"])
        self.assertEqual(summary["focus"], "full")
        self.assertEqual(summary["focus_source"], "inferred")

    def test_cli_project_name_differs_from_folder_slug(self) -> None:
        # `orcai init /x/Fjord-Field-2026 Fjord-Field-2026` → parameter file keeps the
        # CLI name (dashes, case); the folder slug would be `fjord_field_2026`.
        cli_dir = self.parent / "Fjord-Field-2026"
        cli_dir.mkdir()
        (cli_dir / "Fjord-Field-2026_orcai_parameter.json").write_text(
            json.dumps(PARAMETER_DOC), encoding="utf-8"
        )
        project = register_existing_project(str(cli_dir))
        self.assertEqual(project["orcai_name"], "Fjord-Field-2026")
        self.assertTrue(project["initialized"])
        params = read_parameters(project["id"])
        self.assertTrue(params["exists"])
        self.assertEqual(params["filename"], "Fjord-Field-2026_orcai_parameter.json")

    def test_desktop_project_without_focus_infers_from_artifacts(self) -> None:
        project = self._project()
        (Path(project["path"]) / "tvt_data").mkdir()
        (Path(project["path"]) / "tvt_data" / "train.npz").write_bytes(b"x")
        summary = compute_project_summary(project["id"])
        self.assertEqual(summary["focus"], "training")

    # ------------------------------------------------------------------ recording table (FR-2.5)

    def test_recording_table_full_read_and_channel_edit(self) -> None:
        try:
            import soundfile  # noqa: F401
        except ImportError as exc:
            raise unittest.SkipTest("soundfile not installed") from exc

        project = self._project()
        self._init_parameters(project)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        _write_pcm16_wav(rec / "a.wav", sample_rate=48_000)
        _write_pcm16_wav(rec / "b.wav", sample_rate=96_000)
        _write_pcm16_wav(rec / "orphan.wav", sample_rate=48_000)
        (ann / "a.txt").write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        (project_dir / "predictions").mkdir()
        (project_dir / "predictions" / "a_c1_orcai-isl-v1_predicted.txt").write_text(
            "", encoding="utf-8"
        )

        table = project_dir / "recording_table.csv"
        _write_table(
            table,
            [
                {
                    "recording": "a",
                    "channel": "1",
                    "duplicate": "False",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "a.wav",
                    "base_dir_annotation": str(ann),
                    "rel_annotation_path": "a.txt",
                    "BR": "1",
                    "BUZZ": "",
                    "WHISTLE": "1",
                },
                {
                    "recording": "b",
                    "channel": "2",
                    "duplicate": "False",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "b.wav",
                    "BR": "1",
                    "BUZZ": "1",
                    "WHISTLE": "1",
                },
            ],
            ["BR", "BUZZ", "WHISTLE"],
        )

        data = read_recording_table(project["id"])
        self.assertTrue(data["table_exists"])
        self.assertEqual(data["row_count"], 2)
        self.assertEqual(data["class_columns"], ["BR", "BUZZ", "WHISTLE"])
        self.assertEqual(data["columns"][:7], list(TABLE_STANDARD_COLUMNS))
        self.assertEqual(data["target_sampling_rate_hz"], 48_000)

        by_name = {r["recording"]: r for r in data["rows"]}
        self.assertEqual(set(by_name), {"a", "b", "orphan"})
        a, b, orphan = by_name["a"], by_name["b"], by_name["orphan"]
        self.assertTrue(a["in_table"])
        self.assertEqual(a["channel"], 1)
        self.assertTrue(a["annotation_exists"])
        self.assertEqual(a["predict_status"], "done")
        self.assertIsNone(a["resample_to_hz"])
        self.assertEqual(a["cells"]["rel_recording_path"], "a.wav")
        self.assertEqual(b["sample_rate_hz"], 96_000)
        self.assertEqual(b["resample_to_hz"], 48_000)
        self.assertEqual(b["predict_status"], "none")
        self.assertFalse(b["annotation_exists"])
        self.assertFalse(orphan["in_table"])
        self.assertIsNone(orphan["channel"])

        result = set_recording_channel(project["id"], "b", 3)
        self.assertEqual(result["channel"], 3)
        rows = _read_table(table)
        self.assertEqual([r["channel"] for r in rows], ["1", "3"])
        # Other cells untouched, including empty (masked) class cells.
        self.assertEqual(rows[0]["BUZZ"], "")
        self.assertEqual(rows[0]["rel_annotation_path"], "a.txt")
        with self.assertRaises(FileNotFoundError):
            set_recording_channel(project["id"], "missing", 1)
        with self.assertRaises(ValueError):
            set_recording_channel(project["id"], "a", 0)

    def test_resolve_prefers_project_annotations_over_import_source(self) -> None:
        """Copied labels in project/annotations win over still-present import source."""
        project = self._project()
        project_dir = Path(project["path"])
        source = self._home / "import_source"
        source.mkdir()
        (source / "clip.txt").write_text("0.0\t1.0\tBR\nSOURCE\n", encoding="utf-8")
        ann = project_dir / "annotations"
        ann.mkdir(parents=True, exist_ok=True)
        (ann / "clip.txt").write_text("0.0\t1.0\tBR\nPROJECT\n", encoding="utf-8")
        from orcai_desktop_sidecar.project_studio import _resolve_table_file

        resolved = _resolve_table_file(
            project_dir,
            str(source),
            "clip.txt",
        )
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved, ann / "clip.txt")
        self.assertIn("PROJECT", resolved.read_text(encoding="utf-8"))

    def test_recording_table_resolves_foreign_absolute_base_dirs(self) -> None:
        """USB copy: absolute base_dir_* from another Mac still finds local WAV/txt."""
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        (rec / "clip.wav").write_bytes(b"RIFF....WAVEfmt ")  # existence only
        (ann / "clip.txt").write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        table = project_dir / "recording_table.csv"
        _write_table(
            table,
            [
                {
                    "recording": "clip",
                    "channel": "1",
                    "duplicate": "False",
                    "base_dir_recording": "/Users/other/old_machine/recordings",
                    "rel_recording_path": "clip.wav",
                    "base_dir_annotation": "/Users/other/old_machine/annotations",
                    "rel_annotation_path": "clip.txt",
                    "BR": "1",
                },
            ],
            ["BR"],
        )
        data = read_recording_table(project["id"])
        by_name = {r["recording"]: r for r in data["rows"]}
        self.assertTrue(by_name["clip"]["wav_exists"])
        self.assertTrue(by_name["clip"]["annotation_exists"])
        self.assertTrue(by_name["clip"]["in_table"])

    def test_unresolved_csv_path_falls_back_to_stem_wav(self) -> None:
        """Foreign base + wrong rel must not emit table miss + disk orphan for same stem."""
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        (rec / "clip.wav").write_bytes(b"RIFF....WAVEfmt ")
        table = project_dir / "recording_table.csv"
        _write_table(
            table,
            [
                {
                    "recording": "clip",
                    "channel": "1",
                    "duplicate": "False",
                    "base_dir_recording": "/Users/other/old_machine/recordings",
                    "rel_recording_path": "elsewhere.wav",
                    "BR": "1",
                },
            ],
            ["BR"],
        )
        data = read_recording_table(project["id"])
        clips = [r for r in data["rows"] if r["recording"] == "clip"]
        self.assertEqual(len(clips), 1)
        self.assertTrue(clips[0]["in_table"])
        self.assertTrue(clips[0]["wav_exists"])

    def test_recording_table_missing_returns_disk_wavs(self) -> None:
        project = self._project()
        _write_pcm16_wav(Path(project["recordings_dir"]) / "x.wav")
        data = read_recording_table(project["id"])
        self.assertFalse(data["table_exists"])
        self.assertEqual(data["row_count"], 0)
        self.assertEqual([r["recording"] for r in data["rows"]], ["x"])
        self.assertFalse(data["rows"][0]["in_table"])

    def test_recording_table_rows_sorted_by_name(self) -> None:
        """UI/API list is alphabetical even when CSV / disk discovery order is not."""
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        _write_pcm16_wav(rec / "zebra.wav")
        _write_pcm16_wav(rec / "alpha.wav")
        _write_table(
            project_dir / "recording_table.csv",
            [
                {
                    "recording": "mike",
                    "channel": "1",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "mike.wav",
                },
                {
                    "recording": "alpha",
                    "channel": "1",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "alpha.wav",
                },
            ],
            [],
        )
        data = read_recording_table(project["id"])
        self.assertEqual(
            [r["recording"] for r in data["rows"]],
            ["alpha", "mike", "zebra"],
        )

    def test_case_sensitive_stems_are_not_collapsed(self) -> None:
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        _write_table(
            project_dir / "recording_table.csv",
            [
                {"recording": "Rec", "channel": "1", "base_dir_recording": str(rec),
                 "rel_recording_path": "Rec.wav"},
                {"recording": "rec", "channel": "1", "base_dir_recording": str(rec),
                 "rel_recording_path": "rec.wav"},
            ],
            [],
        )
        data = read_recording_table(project["id"])
        self.assertEqual([r["recording"] for r in data["rows"]], ["Rec", "rec"])

    # ------------------------------------------------------------------ annotations (FR-2.7)

    def test_annotations_matrix_marks_masked_classes(self) -> None:
        project = self._project()
        self._init_parameters(project)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        (ann / "a.txt").write_text(
            "start\tstop\tlabel\n0.0\t1.0\tBR\n1.5\t2.0\tBR\n3.0\t3.5\tWHISTLE\n4\t5\tHERDING\n",
            encoding="utf-8",
        )
        _write_table(
            project_dir / "recording_table.csv",
            [
                {
                    "recording": "a",
                    "channel": "1",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "a.wav",
                    "base_dir_annotation": str(ann),
                    "rel_annotation_path": "a.txt",
                    "BR": "1",
                    "BUZZ": "",
                    "WHISTLE": "1",
                },
                {
                    "recording": "b",
                    "channel": "1",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "b.wav",
                },
            ],
            ["BR", "BUZZ", "WHISTLE"],
        )
        matrix = annotations_matrix(project["id"])
        self.assertEqual(matrix["classes"], ["BR", "BUZZ", "WHISTLE"])
        self.assertEqual(matrix["classes_source"], "parameters")
        self.assertTrue(matrix["has_mask_columns"])
        self.assertEqual(matrix["annotated_count"], 1)
        self.assertEqual(matrix["total_count"], 2)
        row = matrix["rows"][0]
        self.assertEqual(row["counts"], {"BR": 2, "BUZZ": None, "WHISTLE": 1})
        self.assertEqual(row["total_labels"], 4)
        self.assertEqual(matrix["unlisted_labels"], ["HERDING"])

    def test_annotations_matrix_falls_back_to_disk_when_csv_path_empty(self) -> None:
        project = self._project()
        self._init_parameters(project)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        (ann / "a.txt").write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        _write_table(
            project_dir / "recording_table.csv",
            [
                {
                    "recording": "a",
                    "channel": "1",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "a.wav",
                },
            ],
            ["BR"],
        )
        matrix = annotations_matrix(project["id"])
        self.assertEqual(matrix["annotated_count"], 1)
        self.assertTrue(matrix["rows"][0]["annotation_path"].endswith("a.txt"))

        table = read_recording_table(project["id"])
        self.assertTrue(table["rows"][0]["annotation_exists"])

    def test_annotations_matrix_lists_disk_pairs_without_csv_rows(self) -> None:
        """BUG-P-01: WAV+.txt must appear even when recording_table has no row."""
        project = self._project()
        self._init_parameters(project)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        rec.mkdir(exist_ok=True)
        ann.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "solo.wav")
        (ann / "solo.txt").write_text("0.0\t1.0\tBR\n1.0\t2.0\tWHISTLE\n", encoding="utf-8")
        # No recording_table.csv at all.
        matrix = annotations_matrix(project["id"])
        self.assertEqual(matrix["annotated_count"], 1)
        self.assertEqual(matrix["rows"][0]["recording"], "solo")
        self.assertEqual(matrix["rows"][0]["counts"]["BR"], 1)
        self.assertEqual(matrix["rows"][0]["counts"]["WHISTLE"], 1)
        self.assertEqual(matrix["classes_source"], "parameters")

    def test_import_annotations_pairs_and_unpaired(self) -> None:
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        rec.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        src_ok = self._home / "a.txt"
        src_ok.write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        src_orphan = self._home / "orphan.txt"
        src_orphan.write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        src_bad = self._home / "x_predicted.txt"
        src_bad.write_text("0.0\t1.0\tBR\n", encoding="utf-8")

        result = import_annotations(
            project["id"], [str(src_ok), str(src_orphan), str(src_bad)]
        )
        self.assertEqual(result["imported_count"], 2)
        self.assertEqual(result["paired_count"], 1)
        self.assertEqual(result["unpaired_imported_count"], 1)
        self.assertEqual(result["unpaired_count"], 1)
        self.assertTrue((project_dir / "annotations" / "a.txt").is_file())
        self.assertTrue((project_dir / "annotations" / "orphan.txt").is_file())
        self.assertFalse((project_dir / "annotations" / "x_predicted.txt").is_file())
        self.assertEqual(len(result["failed"]), 1)
        self.assertEqual(result["failed"][0]["error"], "unsupported_type")

        matrix = annotations_matrix(project["id"])
        self.assertEqual(matrix["unpaired_count"], 1)
        self.assertEqual(matrix["unpaired"][0]["name"], "orphan.txt")

        deleted = delete_annotations(project["id"], ["orphan.txt"])
        self.assertEqual(deleted["removed"], ["orphan.txt"])
        self.assertEqual(deleted["unpaired"], [])

    def test_import_annotations_replaces_untouched_starter_calls(self) -> None:
        """Starter calls with none of those names in the files become the annotation classes."""
        project = self._project()
        doc = json.loads(json.dumps(PARAMETER_DOC))
        doc["calls"] = list(orcai_parameter_defaults()["calls"])
        path = self._init_parameters(project, doc)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        rec.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        src = self._home / "a.txt"
        src.write_text("0.0\t1.0\tMEX\n1.0\t2.0\tKAV\n", encoding="utf-8")

        result = import_annotations(project["id"], [str(src)])
        self.assertEqual(result["added_calls"], ["KAV", "MEX"])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["calls"], ["KAV", "MEX"])
        self.assertEqual(annotations_matrix(project["id"])["unlisted_labels"], [])

    def test_import_annotations_keeps_starter_calls_used_in_files(self) -> None:
        project = self._project()
        doc = json.loads(json.dumps(PARAMETER_DOC))
        starter = list(orcai_parameter_defaults()["calls"])
        doc["calls"] = starter
        path = self._init_parameters(project, doc)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        rec.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        src = self._home / "a.txt"
        src.write_text("0.0\t1.0\tWHISTLE\n1.0\t2.0\tKAV\n", encoding="utf-8")

        result = import_annotations(project["id"], [str(src)])
        self.assertEqual(result["added_calls"], ["KAV"])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["calls"], [*starter, "KAV"])

    def test_import_annotations_appends_missing_calls(self) -> None:
        """A list that is no longer the starter set keeps its names and gains new labels."""
        project = self._project()
        path = self._init_parameters(project)
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        rec.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        src = self._home / "a.txt"
        src.write_text("0.0\t1.0\tKAV\n1.0\t2.0\tBR\n2.0\t3.0\tMEX\n", encoding="utf-8")
        orphan = self._home / "orphan.txt"
        orphan.write_text("0.0\t1.0\tZOR\n", encoding="utf-8")

        result = import_annotations(project["id"], [str(src), str(orphan)])
        self.assertEqual(result["added_calls"], ["KAV", "MEX"])
        calls = json.loads(path.read_text(encoding="utf-8"))["calls"]
        self.assertEqual(calls, ["BR", "BUZZ", "WHISTLE", "KAV", "MEX"])

        matrix = annotations_matrix(project["id"])
        self.assertEqual(matrix["unlisted_labels"], [])

        again = import_annotations(project["id"], [str(src)])
        self.assertEqual(again["added_calls"], [])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["calls"], calls)

    def test_append_annotation_calls_skips_missing_parameter(self) -> None:
        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        rec.mkdir(exist_ok=True)
        ann.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        (ann / "a.txt").write_text("0.0\t1.0\tKAV\n", encoding="utf-8")
        self.assertEqual(append_annotation_calls(project["id"]), [])

    def test_rewrite_table_base_dirs_heals_import_source(self) -> None:
        """CSV rows that still point at the annotation import folder are rewritten."""
        from orcai_desktop_sidecar.project_studio import _rewrite_table_base_dirs

        project = self._project()
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        rec.mkdir(exist_ok=True)
        ann.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "a.wav")
        (ann / "a.txt").write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        foreign_ann = self._home / "imported_labels"
        foreign_ann.mkdir(exist_ok=True)
        foreign_rec = self._home / "imported_wavs"
        foreign_rec.mkdir(exist_ok=True)
        table = project_dir / "recording_table.csv"
        table.write_text(
            "recording,channel,duplicate,base_dir_recording,rel_recording_path,"
            "base_dir_annotation,rel_annotation_path\n"
            f"a,1,False,{foreign_rec},a.wav,{foreign_ann},a.txt\n",
            encoding="utf-8",
        )
        _rewrite_table_base_dirs(project_dir)
        text = table.read_text(encoding="utf-8")
        self.assertIn(str(ann), text)
        self.assertIn(str(rec), text)
        self.assertNotIn(str(foreign_ann), text)
        self.assertNotIn(str(foreign_rec), text)
        # Opening the matrix also heals.
        table.write_text(
            "recording,channel,duplicate,base_dir_recording,rel_recording_path,"
            "base_dir_annotation,rel_annotation_path\n"
            f"a,1,False,{foreign_rec},a.wav,{foreign_ann},a.txt\n",
            encoding="utf-8",
        )
        annotations_matrix(project["id"])
        text2 = table.read_text(encoding="utf-8")
        self.assertIn(str(ann), text2)
        self.assertNotIn(str(foreign_ann), text2)

    # ------------------------------------------------------------------ artifacts (FR-2.8)

    def test_artifacts_listing(self) -> None:
        project = self._project()
        project_dir = Path(project["path"])
        (project_dir / "models" / "m1").mkdir(parents=True)
        (project_dir / "models" / "m1" / "model.keras").write_bytes(b"12345")
        (project_dir / "models" / ".DS_Store").write_bytes(b"x")
        data = list_artifacts(project["id"])
        names = [i["name"] for i in data["items"]]
        self.assertEqual(
            names, ["spectrograms", "label_arrays", "tvt_data", "models", "predictions"]
        )
        models = next(i for i in data["items"] if i["name"] == "models")
        self.assertTrue(models["exists"])
        self.assertEqual(models["file_count"], 1)
        self.assertEqual(models["size_bytes"], 5)
        self.assertIsNotNone(models["updated_at"])
        spec = next(i for i in data["items"] if i["name"] == "spectrograms")
        self.assertFalse(spec["exists"])
        self.assertEqual(data["present_count"], 1)

    # ------------------------------------------------------------------ parameters (FR-2.9)

    def test_parameters_validate_and_save(self) -> None:
        project = self._project()
        missing = read_parameters(project["id"])
        self.assertFalse(missing["exists"])
        self.assertFalse(missing["validation"]["valid"])

        path = self._init_parameters(project)
        data = read_parameters(project["id"])
        self.assertTrue(data["exists"])
        self.assertTrue(data["validation"]["valid"])
        self.assertEqual(data["filename"], path.name)

        broken = validate_parameters_text("{ not json")
        self.assertFalse(broken["valid"])
        self.assertTrue(broken["errors"][0].startswith("JSON:"))

        doc = dict(PARAMETER_DOC)
        doc["calls"] = []
        bad_calls = validate_parameters_text(json.dumps(doc))
        self.assertIn("calls must be a non-empty list of class names", bad_calls["errors"])

        doc = json.loads(json.dumps(PARAMETER_DOC))
        doc["spectrogram"]["n_overlap"] = 1024
        bad_spec = validate_parameters_text(json.dumps(doc))
        self.assertIn("spectrogram.n_overlap must be smaller than nfft", bad_spec["errors"])

        ok = validate_parameters_text(json.dumps(PARAMETER_DOC))
        self.assertTrue(ok["valid"])
        self.assertTrue(any("TAILSLAP" in w for w in ok["warnings"]))

        with self.assertRaises(ValueError):
            write_parameters(project["id"], "{}")

        doc = json.loads(json.dumps(PARAMETER_DOC))
        doc["seed"] = 42
        saved = write_parameters(project["id"], json.dumps(doc))
        self.assertTrue(saved["validation"]["valid"])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["seed"], 42)
        self.assertTrue(get_project(project["id"])["initialized"])

    # ------------------------------------------------------------------ data_health (shell banner)

    def test_compute_data_health_missing_wav_unpaired_and_gap(self) -> None:
        project = self._project("Health")
        project_dir = Path(project["path"])
        rec = project_dir / "recordings"
        ann = project_dir / "annotations"
        ann.mkdir(exist_ok=True)
        _write_pcm16_wav(rec / "ok.wav")
        (ann / "ok.txt").write_text("0.0 1.0 WHISTLE\n", encoding="utf-8")
        (ann / "orphan.txt").write_text("0.0 0.5 BR\n", encoding="utf-8")
        table = project_dir / "recording_table.csv"
        _write_table(
            table,
            [
                {
                    "recording": "ok",
                    "channel": "1",
                    "duplicate": "0",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "ok.wav",
                    "base_dir_annotation": str(ann),
                    "rel_annotation_path": "ok.txt",
                },
                {
                    "recording": "gone",
                    "channel": "1",
                    "duplicate": "0",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "gone.wav",
                    "base_dir_annotation": "",
                    "rel_annotation_path": "",
                },
                {
                    "recording": "bare",
                    "channel": "1",
                    "duplicate": "0",
                    "base_dir_recording": str(rec),
                    "rel_recording_path": "bare.wav",
                    "base_dir_annotation": "",
                    "rel_annotation_path": "",
                },
            ],
            [],
        )
        _write_pcm16_wav(rec / "bare.wav")

        health = compute_data_health(project_dir, table_sync="current", wav_count=2)
        self.assertFalse(health["table_stale"])
        self.assertEqual(health["missing_wav"], 1)
        self.assertEqual(health["unpaired_ann"], 1)
        self.assertEqual(health["ann_gap"], 1)

        summary = compute_project_summary(project["id"])
        self.assertIn("data_health", summary)
        self.assertEqual(summary["data_health"]["missing_wav"], 1)
        self.assertEqual(summary["data_health"]["unpaired_ann"], 1)


if __name__ == "__main__":
    unittest.main()
