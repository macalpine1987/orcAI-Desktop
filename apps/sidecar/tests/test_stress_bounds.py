"""Stress / bound checks for in-memory job registry, logs, pipeline cache, scheduler."""

from __future__ import annotations

import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ORCAI_FORCE_INPROCESS_JOBS", "1")

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.job_logs import (
    JOB_LOG_MAX_LINES,
    JOBS_MAX_TERMINAL_IN_MEMORY,
    _push_log_line,
    _trim_job_log,
)
from orcai_desktop_sidecar.job_queue import JobScheduler
from orcai_desktop_sidecar.job_registry_state import JOBS_LOCK, JOBS_REGISTRY
from orcai_desktop_sidecar.job_types import JobStatus, _TERMINAL_STATUSES
from orcai_desktop_sidecar.jobs import create_job, set_status
from orcai_desktop_sidecar.train_pipeline_cache import (
    get_cached_pipeline,
    store_pipeline_cache,
)
from orcai_desktop_sidecar.train_pipeline_cache import PIPELINE_CACHE as _pipeline_cache


def _reset_jobs() -> None:
    jobs._bootstrapped = False
    with JOBS_LOCK:
        JOBS_REGISTRY.clear()


class StressJobsFixture(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        _reset_jobs()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        _reset_jobs()
        _pipeline_cache.clear()


class JobRegistryStressTests(StressJobsFixture):
    def test_terminal_job_flood_stays_within_cap(self) -> None:
        """Many completed jobs must not grow RAM registry without bound."""
        n = JOBS_MAX_TERMINAL_IN_MEMORY + 120
        for i in range(n):
            job = create_job("predict", {"recording_path": f"/tmp/r{i}.wav"})
            set_status(job.id, JobStatus.COMPLETED)
        with JOBS_LOCK:
            terminal = sum(
                1 for j in JOBS_REGISTRY.values() if j.status in _TERMINAL_STATUSES
            )
            self.assertLessEqual(terminal, JOBS_MAX_TERMINAL_IN_MEMORY)
            self.assertLessEqual(len(JOBS_REGISTRY), JOBS_MAX_TERMINAL_IN_MEMORY + 5)

    def test_verbose_log_flood_trims_to_ring(self) -> None:
        job = create_job("train", {"project_dir": str(self._home)})
        with JOBS_LOCK:
            live = JOBS_REGISTRY[job.id]
            for i in range(JOB_LOG_MAX_LINES + 2500):
                _push_log_line(live, f"epoch line {i}")
            self.assertLessEqual(len(live.log), JOB_LOG_MAX_LINES)
            self.assertGreaterEqual(live.log_base, 2500)
            _trim_job_log(live, max_lines=500)
            self.assertLessEqual(len(live.log), 500)


class PipelineCacheStressTests(StressJobsFixture):
    def test_pipeline_cache_prunes_under_key_flood(self) -> None:
        for i in range(200):
            store_pipeline_cache(f"proj-{i}", {"ok": True, "i": i})
        self.assertLessEqual(len(_pipeline_cache), 64)
        # Latest keys still resolvable via store path.
        hit = get_cached_pipeline("proj-199", fresh=False)
        self.assertIsNotNone(hit)


class SchedulerStressTests(unittest.TestCase):
    def test_burst_submit_serial_slot_does_not_deadlock(self) -> None:
        done: list[str] = []
        lock = threading.Lock()

        def work(job_id: str, command: str, params: dict) -> None:
            time.sleep(0.01)
            with lock:
                done.append(job_id)
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=1)
        for i in range(40):
            sched.submit(f"j{i}", "predict", {}, work, priority=0)
        # Wait until queue drains.
        deadline = time.time() + 8.0
        while time.time() < deadline:
            snap = sched.snapshot()
            if not snap.get("running") and not snap.get("pending"):
                break
            time.sleep(0.02)
        snap = sched.snapshot()
        self.assertEqual(snap.get("running") or [], [])
        self.assertEqual(len(done), 40)

    def test_concurrent_max_two_never_exceeds_slots(self) -> None:
        running_peak = 0
        peak_lock = threading.Lock()
        active = 0

        def work(job_id: str, command: str, params: dict) -> None:
            nonlocal active, running_peak
            with peak_lock:
                active += 1
                running_peak = max(running_peak, active)
            time.sleep(0.03)
            with peak_lock:
                active -= 1
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=2)
        for i in range(24):
            sched.submit(f"c{i}", "predict", {}, work, priority=0)
        deadline = time.time() + 8.0
        while time.time() < deadline:
            snap = sched.snapshot()
            if not snap.get("running") and not snap.get("pending"):
                break
            time.sleep(0.02)
        self.assertLessEqual(running_peak, 2)


if __name__ == "__main__":
    unittest.main()
