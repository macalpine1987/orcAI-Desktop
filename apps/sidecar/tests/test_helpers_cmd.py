"""Tests for helper command adapters."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.adapters.helpers_cmd import run_create_recording_table
from orcai_desktop_sidecar.jobs import create_job
from orcai_desktop_sidecar.recording_table_params import resolve_update_table_path


def _boom_engine_kwargs(*_args, **_kwargs):
    raise RuntimeError("engine boom")


def _write_wav(path: Path) -> None:
    import soundfile as sf

    sf.write(str(path), np.zeros(1600, dtype=np.float32), 16_000)


class ResolveUpdateTablePathTests(unittest.TestCase):
    def test_false_and_none_mean_no_update(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "recording_table.csv"
            out.write_text("recording\n0\n", encoding="utf-8")
            self.assertIsNone(resolve_update_table_path({}, out))
            self.assertIsNone(resolve_update_table_path({"update_table": False}, out))

    def test_true_uses_output_path_when_csv_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "recording_table.csv"
            out.write_text("recording\n0\n", encoding="utf-8")
            resolved = resolve_update_table_path({"update_table": True}, out)
            assert resolved is not None
            self.assertEqual(resolved, out)

    def test_true_without_existing_csv_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "recording_table.csv"
            self.assertIsNone(resolve_update_table_path({"update_table": True}, out))

    def test_string_path_passthrough(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "recording_table.csv"
            custom = Path(tmp) / "legacy_table.csv"
            custom.write_text("recording\n0\n", encoding="utf-8")
            resolved = resolve_update_table_path({"update_table": str(custom)}, out)
            self.assertEqual(resolved, custom)


class CreateRecordingTableMergeTests(unittest.TestCase):
    """Merge must free output_path — orcAI sys.exit() if the CSV already exists."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        jobs._bootstrapped = False
        jobs._jobs.clear()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        jobs._bootstrapped = False
        jobs._jobs.clear()

    def test_merge_existing_csv_adds_new_wav_and_sorts(self) -> None:
        try:
            import soundfile  # noqa: F401
        except ImportError as exc:
            raise unittest.SkipTest("soundfile not installed") from exc

        root = self._home / "proj"
        rec = root / "recordings"
        rec.mkdir(parents=True)
        _write_wav(rec / "zebra.wav")
        _write_wav(rec / "alpha.wav")
        csv = root / "recording_table.csv"
        # Previous table had only zebra; channel custom value must survive merge.
        csv.write_text(
            "recording,channel,duplicate,base_dir_recording,rel_recording_path,"
            "base_dir_annotation,rel_annotation_path\n"
            f"zebra,2,False,{rec},zebra.wav,,\n",
            encoding="utf-8",
        )
        params = {
            "base_dir_recording": str(rec),
            "output_path": str(csv),
            "update_table": str(csv),
            "update_paths": True,
            "overwrite": False,
            "verbosity": 0,
        }
        job = create_job("create-recording-table", params)
        result = run_create_recording_table(job.id, params)
        self.assertEqual(result["row_count"], 2)
        self.assertTrue(csv.is_file())
        # Side-copy for merge must not leak next to the project CSV.
        leftovers = list(root.glob(".*orcai-desktop-update-src"))
        self.assertEqual(leftovers, [])

        text = csv.read_text(encoding="utf-8")
        lines = [ln for ln in text.strip().splitlines() if ln.strip()]
        # Header + alpha then zebra (sorted by name).
        self.assertEqual(len(lines), 3)
        self.assertIn("alpha", lines[1])
        self.assertIn("zebra", lines[2])
        # Prior channel for zebra preserved via update_table.
        self.assertRegex(lines[2], r"^zebra,2,")

    def test_create_refuses_existing_without_update_or_overwrite(self) -> None:
        root = self._home / "proj2"
        rec = root / "recordings"
        rec.mkdir(parents=True)
        csv = root / "recording_table.csv"
        csv.write_text("recording\nx\n", encoding="utf-8")
        params = {
            "base_dir_recording": str(rec),
            "output_path": str(csv),
            "overwrite": False,
            "verbosity": 0,
        }
        job = create_job("create-recording-table", params)
        with self.assertRaises(FileExistsError):
            run_create_recording_table(job.id, params)

    def test_failed_sync_restores_existing_csv(self) -> None:
        root = self._home / "proj3"
        rec = root / "recordings"
        rec.mkdir(parents=True)
        csv = root / "recording_table.csv"
        csv.write_text("recording,channel\nzebra,2\n", encoding="utf-8")
        params = {
            "base_dir_recording": str(rec),
            "output_path": str(csv),
            "update_table": True,
            "overwrite": False,
            "verbosity": 0,
        }
        job = create_job("create-recording-table", params)
        # Fail after the CSV is moved aside (same module object the runner uses).
        with patch.dict(
            run_create_recording_table.__globals__,
            {"engine_kwargs": _boom_engine_kwargs},
        ), self.assertRaises(RuntimeError):
            run_create_recording_table(job.id, params)
        self.assertTrue(csv.is_file())
        self.assertIn("zebra,2", csv.read_text(encoding="utf-8"))
        leftovers = list(root.glob(".*orcai-desktop-update-src"))
        self.assertEqual(leftovers, [])


if __name__ == "__main__":
    unittest.main()
