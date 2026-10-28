"""Maintenance: spectrogram cache wipe and factory reset of Desktop SQLite."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.jobs import create_job
from orcai_desktop_sidecar.store import (
    connect,
    list_all_jobs,
    list_project_rows,
    persist_job,
    project_db_path,
    upsert_project_row,
)


def _reset_jobs_module() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class SpectrogramCacheClearTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        os.environ["ORCAI_SPEC_CACHE_ROOT"] = self._tmpdir.name

    def tearDown(self) -> None:
        os.environ.pop("ORCAI_SPEC_CACHE_ROOT", None)
        self._tmpdir.cleanup()

    def test_clear_disk_and_ram_cache_removes_files(self) -> None:
        from orcai_desktop_sidecar.maintenance import clear_spectrogram_tile_cache

        root = Path(self._tmpdir.name)
        blob = root / "tile.bin"
        blob.write_bytes(b"spec")
        nested = root / "abc" / "meta.json"
        nested.parent.mkdir(parents=True, exist_ok=True)
        nested.write_text("{}", encoding="utf-8")

        result = clear_spectrogram_tile_cache()
        self.assertGreaterEqual(result["files_removed"], 2)
        self.assertFalse(blob.exists())
        self.assertFalse(nested.exists())
        self.assertTrue(root.is_dir())


class FactoryResetTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._root = Path(self._tmp.name)
        self._home = self._root / "orcai-desktop-data"
        self._home.mkdir()
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        _reset_jobs_module()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        _reset_jobs_module()

    def test_factory_reset_wipes_jobs_projects_and_project_db(self) -> None:
        from orcai_desktop_sidecar.maintenance import factory_reset_desktop

        create_job("predict", {"recording_path": "/tmp/a.wav"})
        conn = connect()
        project_root = self._root / "Fjord"
        upsert_project_row(
            conn,
            id="p1",
            path=str(project_root),
            display_name="Fjord",
            description="",
            orcai_name="Fjord",
            created_at=1.0,
            updated_at=1.0,
        )
        project_root.mkdir()
        persist_job(
            connect(project_db_path(project_root)),
            {
                "id": "job-proj",
                "command": "predict",
                "params": {"project_dir": str(project_root)},
                "status": "completed",
                "created_at": 1.0,
                "updated_at": 2.0,
                "log": [],
                "result": None,
                "error": None,
            },
        )
        pdb = project_db_path(project_root)
        self.assertTrue(pdb.is_file())

        cache_dir = self._root / "spec-cache-override"
        cache_dir.mkdir()
        (cache_dir / "x.bin").write_bytes(b"x")
        audio = self._home / "audio-cache" / "clip.wav"
        audio.parent.mkdir(parents=True, exist_ok=True)
        audio.write_bytes(b"wav")
        with patch.dict(os.environ, {"ORCAI_SPEC_CACHE_ROOT": str(cache_dir)}):
            result = factory_reset_desktop()

        self.assertFalse(self._home.exists())
        self.assertFalse(audio.exists())
        self.assertFalse((cache_dir / "x.bin").exists())
        self.assertFalse(pdb.is_file())
        self.assertTrue(project_root.is_dir())
        self.assertEqual(list_all_jobs(), [])
        self.assertEqual(list_project_rows(connect()), [])
        self.assertGreaterEqual(result["database"]["projects_cleared"], 1)
        self.assertGreaterEqual(result["cache"]["files_removed"], 1)
        self.assertTrue(result["data_dir"]["removed"])
