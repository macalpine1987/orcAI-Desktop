"""Tests for JobMessenger."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.jobs import create_job, get_job
from orcai_desktop_sidecar.messenger import JobMessenger


class JobMessengerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_init_with_title_does_not_raise(self) -> None:
        job = create_job("init", {"project_dir": "/tmp/p", "project_name": "demo"})
        msgr = JobMessenger(job.id, verbosity=2, title="Initializing project")
        msgr.info("test line")
        refreshed = get_job(job.id)
        self.assertIsNotNone(refreshed)
        self.assertTrue(any("test line" in line for line in refreshed.log))


if __name__ == "__main__":
    unittest.main()
