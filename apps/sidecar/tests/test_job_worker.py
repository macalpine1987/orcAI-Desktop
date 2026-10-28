"""Worker entry point marks import/runtime failures as failed jobs."""

from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.job_worker import run_job_in_worker
from orcai_desktop_sidecar.jobs import JobStatus, create_job, get_job


def _reset_jobs_module() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class JobWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        _reset_jobs_module()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        _reset_jobs_module()

    def test_import_failure_marks_job_failed(self) -> None:
        job = create_job("init", {"project_dir": "/tmp/p", "project_name": "x"})

        def boom(*_args: object, **_kwargs: object) -> None:
            raise ModuleNotFoundError("No module named 'orcai'")

        fake_runner = types.ModuleType("orcai_desktop_sidecar.runner")
        fake_runner.run_job = boom  # type: ignore[attr-defined]

        with patch.dict(sys.modules, {"orcai_desktop_sidecar.runner": fake_runner}):
            run_job_in_worker(job.id, "init", job.params)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.FAILED)
        self.assertIn("orcai", refreshed.error or "")


if __name__ == "__main__":
    unittest.main()
