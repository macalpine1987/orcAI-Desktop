"""Ring-buffer bound for per-job logs (Stage 8 / finding 19)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.jobs import (
    JOB_LOG_MAX_LINES,
    append_log,
    create_job,
    get_job,
    job_log_abs_len,
    job_to_dict,
)


def _reset_jobs_module() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class JobLogTailTests(unittest.TestCase):
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

    def test_append_log_trims_and_keeps_absolute_index(self) -> None:
        job = create_job("predict", {"recording_path": "/tmp/a.wav"})
        total = JOB_LOG_MAX_LINES + 25
        for i in range(total):
            append_log(job.id, f"line-{i}")
        live = get_job(job.id)
        assert live is not None
        self.assertEqual(len(live.log), JOB_LOG_MAX_LINES)
        self.assertEqual(live.log_base, 25)
        self.assertEqual(job_log_abs_len(live), total)
        self.assertEqual(live.log[0], "line-25")
        self.assertEqual(live.log[-1], f"line-{total - 1}")
        payload = job_to_dict(live)
        self.assertEqual(payload["log_base"], 25)
        self.assertEqual(len(payload["log"]), JOB_LOG_MAX_LINES)


if __name__ == "__main__":
    unittest.main()
