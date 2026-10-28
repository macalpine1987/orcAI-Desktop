"""Unit tests for job status transitions and DB merge."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.jobs import (
    JobStatus,
    cancel_job,
    cancel_jobs_on_shutdown,
    clear_jobs_history,
    create_job,
    get_job,
    list_jobs,
    set_status,
)
from orcai_desktop_sidecar.store import list_all_jobs


def _reset_jobs_module() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class JobStatusTests(unittest.TestCase):
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

    def test_cancelled_job_cannot_be_marked_completed(self) -> None:
        job = create_job("predict", {"recording_path": "/tmp/a.wav"})
        cancel_job(job.id)
        result = set_status(job.id, JobStatus.COMPLETED, result={"ok": True})
        self.assertIsNotNone(result)
        self.assertEqual(result.status, JobStatus.CANCELLED)
        self.assertIsNone(result.result)

    def test_cancel_persists_before_worker_completion(self) -> None:
        job = create_job("predict", {"recording_path": "/tmp/a.wav"})
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        set_status(job.id, JobStatus.COMPLETED, result={"label_path": "/tmp/out.txt"})
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.CANCELLED)

    def test_started_at_set_on_running(self) -> None:
        job = create_job("hpsearch", {"data_dir": "/tmp/d", "output_dir": "/tmp/o"})
        self.assertIsNone(job.started_at)
        job.created_at = 1_000.0
        job.updated_at = 1_000.0
        set_status(job.id, JobStatus.RUNNING)
        live = get_job(job.id)
        assert live is not None
        self.assertIsNotNone(live.started_at)
        self.assertGreaterEqual(live.started_at, live.created_at)
        first_start = live.started_at
        set_status(job.id, JobStatus.RUNNING)
        self.assertEqual(get_job(job.id).started_at, first_start)
        self.assertEqual(jobs.job_to_dict(get_job(job.id))["started_at"], first_start)

    def test_status_publish_includes_started_at(self) -> None:
        from unittest.mock import patch

        job = create_job("predict", {"recording_path": "/tmp/a.wav"})
        published: list[dict] = []

        def _capture(_job_id: str, payload: dict) -> None:
            published.append(payload)

        with patch(
            "orcai_desktop_sidecar.job_stream.publish",
            side_effect=_capture,
        ):
            set_status(job.id, JobStatus.RUNNING)

        self.assertTrue(published)
        last = published[-1]
        self.assertEqual(last.get("type"), "status")
        self.assertEqual(last.get("status"), JobStatus.RUNNING.value)
        self.assertIn("started_at", last)
        self.assertIsInstance(last["started_at"], float)

    def test_list_all_jobs_merges_by_updated_at(self) -> None:
        from orcai_desktop_sidecar.store import connect, persist_job

        older = {
            "id": "job-merge",
            "command": "predict",
            "params": {},
            "status": "running",
            "created_at": 1.0,
            "updated_at": 10.0,
            "log": [],
            "result": None,
            "error": None,
        }
        newer = {**older, "status": "cancelled", "updated_at": 20.0, "error": "Cancelled"}

        from orcai_desktop_sidecar.store import project_db_path

        persist_job(connect(), older)
        project_root = self._home / "project"
        project_root.mkdir()
        persist_job(connect(project_db_path(project_root)), newer)

        merged = list_all_jobs(project_dir=str(project_root))
        row = next(j for j in merged if j["id"] == "job-merge")
        self.assertEqual(row["status"], "cancelled")

    def _seed_job(self, conn, **overrides: object) -> dict:
        from orcai_desktop_sidecar.store import persist_job

        row = {
            "id": "job-seed",
            "command": "init",
            "params": {},
            "status": "pending",
            "created_at": 10.0,
            "updated_at": 10.0,
            "log": ["Queued: init"],
            "result": None,
            "error": None,
            "command_line": "orcai init /tmp/p p",
            "exit_code": None,
            "progress": None,
            "priority": 0,
            "artifacts": [],
            "retry_of": None,
            "started_at": None,
        }
        row.update(overrides)
        persist_job(conn, row)
        return row

    def test_reload_keeps_queued_jobs_so_a_worker_can_start_them(self) -> None:
        """A job worker calls bootstrap in a fresh process. That must not cancel the task."""
        from orcai_desktop_sidecar.store import connect, project_db_path

        project = self._home / "proj"
        project.mkdir()
        project_dir = str(project)
        app = connect()
        self._seed_job(
            app,
            id="left-pending",
            params={"project_dir": project_dir, "project_name": "p"},
            log=["Queued: init"],
        )
        self._seed_job(
            connect(project_db_path(project)),
            id="left-pending",
            params={"project_dir": project_dir, "project_name": "p"},
            updated_at=40.0,
            log=["Queued: init", "still waiting"],
        )
        self._seed_job(
            app,
            id="left-running",
            command="predict",
            params={"recording_path": "/tmp/a.wav"},
            status="running",
            started_at=12.0,
            progress=0.4,
        )
        self._seed_job(
            app,
            id="left-done",
            command="predict",
            params={"recording_path": "/tmp/b.wav"},
            status="completed",
            result={"ok": True},
            exit_code=0,
        )
        app.close()

        _reset_jobs_module()
        jobs.bootstrap_jobs()
        pending = get_job("left-pending")
        running = get_job("left-running")
        done = get_job("left-done")
        assert pending is not None and running is not None and done is not None
        self.assertEqual(pending.status, JobStatus.PENDING)
        self.assertEqual(running.status, JobStatus.RUNNING)
        self.assertEqual(done.status, JobStatus.COMPLETED)
        self.assertEqual(pending.log, ["Queued: init", "still waiting"])

        set_status("left-pending", JobStatus.RUNNING)
        started = get_job("left-pending")
        assert started is not None
        self.assertEqual(started.status, JobStatus.RUNNING)

    def test_shutdown_cancels_only_the_live_queue(self) -> None:
        from orcai_desktop_sidecar.store import connect, get_job_db, project_db_path

        project = self._home / "proj"
        project.mkdir()
        project_dir = str(project)
        queued = create_job("init", {"project_dir": project_dir, "project_name": "p"})
        active = create_job("predict", {"recording_path": "/tmp/a.wav", "project_dir": project_dir})
        set_status(active.id, JobStatus.RUNNING)
        done = create_job("predict", {"recording_path": "/tmp/b.wav"})
        set_status(done.id, JobStatus.COMPLETED, result={"ok": True})
        failed = create_job("test", {"model_dir": "/tmp/m", "data_dir": "/tmp/d"})
        set_status(failed.id, JobStatus.FAILED, error="inflate() failed", exit_code=1)

        self.assertEqual(cancel_jobs_on_shutdown(), 2)

        queued_row = get_job(queued.id)
        active_row = get_job(active.id)
        done_row = get_job(done.id)
        failed_row = get_job(failed.id)
        assert queued_row is not None and active_row is not None
        assert done_row is not None and failed_row is not None
        self.assertEqual(queued_row.status, JobStatus.CANCELLED)
        self.assertEqual(active_row.status, JobStatus.CANCELLED)
        self.assertEqual(queued_row.error, "Cancelled by user")
        self.assertEqual(queued_row.exit_code, 130)
        self.assertEqual(queued_row.log.count("Cancelled by user."), 1)
        self.assertEqual(done_row.status, JobStatus.COMPLETED)
        self.assertEqual(done_row.result, {"ok": True})
        self.assertEqual(failed_row.status, JobStatus.FAILED)
        self.assertEqual(failed_row.error, "inflate() failed")

        for conn in (connect(), connect(project_db_path(project))):
            stored = get_job_db(conn, queued.id)
            assert stored is not None
            self.assertEqual(stored["status"], "cancelled")
            conn.close()

        self.assertEqual(cancel_jobs_on_shutdown(), 0)
        again = get_job(queued.id)
        assert again is not None
        self.assertEqual(again.log.count("Cancelled by user."), 1)

        fresh = create_job("predict", {"recording_path": "/tmp/c.wav"})
        self.assertEqual(fresh.status, JobStatus.PENDING)

    def test_sidecar_start_drops_queue_left_by_the_previous_process(self) -> None:
        """A new sidecar process has no workers, so leftover live rows must go.

        Quit sometimes kills the process before cancel-active or the crash
        marker. Finished rows stay. A job created after startup stays pending.
        """
        from orcai_desktop_sidecar.store import connect, get_job_db

        queued = create_job(
            "create-recording-table",
            {"project_dir": "/tmp/p", "project_name": "p"},
        )
        active = create_job("predict", {"recording_path": "/tmp/a.wav"})
        set_status(active.id, JobStatus.RUNNING)
        done = create_job("predict", {"recording_path": "/tmp/b.wav"})
        set_status(done.id, JobStatus.COMPLETED, result={"ok": True})
        failed = create_job("test", {"model_dir": "/tmp/m", "data_dir": "/tmp/d"})
        set_status(failed.id, JobStatus.FAILED, error="inflate() failed", exit_code=1)
        _reset_jobs_module()
        marker = self._home / "sidecar-crashed"
        marker.write_text("1", encoding="utf-8")

        from orcai_desktop_sidecar.main import _startup

        _startup()

        queued_row = get_job(queued.id)
        active_row = get_job(active.id)
        done_row = get_job(done.id)
        failed_row = get_job(failed.id)
        assert queued_row is not None and active_row is not None
        assert done_row is not None and failed_row is not None
        self.assertEqual(queued_row.status, JobStatus.CANCELLED)
        self.assertEqual(active_row.status, JobStatus.CANCELLED)
        self.assertEqual(queued_row.error, "Cancelled by user")
        self.assertEqual(queued_row.exit_code, 130)
        self.assertEqual(done_row.status, JobStatus.COMPLETED)
        self.assertEqual(done_row.result, {"ok": True})
        self.assertEqual(failed_row.status, JobStatus.FAILED)
        self.assertEqual(failed_row.error, "inflate() failed")
        self.assertFalse(marker.exists())

        conn = connect()
        stored = get_job_db(conn, queued.id)
        conn.close()
        assert stored is not None
        self.assertEqual(stored["status"], "cancelled")

        fresh = create_job("predict", {"recording_path": "/tmp/c.wav"})
        self.assertEqual(fresh.status, JobStatus.PENDING)

    def test_sidecar_start_drops_leftovers_without_a_crash_marker(self) -> None:
        queued = create_job("init", {"project_dir": "/tmp/p", "project_name": "p"})
        _reset_jobs_module()
        self.assertFalse((self._home / "sidecar-crashed").exists())

        from orcai_desktop_sidecar.main import _startup

        _startup()

        row = get_job(queued.id)
        assert row is not None
        self.assertEqual(row.status, JobStatus.CANCELLED)

    def test_clear_jobs_history_removes_all_rows(self) -> None:
        create_job("predict", {"recording_path": "/tmp/a.wav"})
        create_job("init", {"project_dir": "/tmp/project"})
        self.assertGreaterEqual(len(list_all_jobs()), 2)
        result = clear_jobs_history()
        self.assertGreaterEqual(result["deleted"], 2)
        self.assertEqual(list_all_jobs(), [])
        self.assertEqual(list_jobs(), [])

    def test_running_progress_does_not_overwrite_cancelled(self) -> None:
        import time

        from orcai_desktop_sidecar.jobs import set_progress
        from orcai_desktop_sidecar.store import (
            _merge_job_row,
            connect,
            get_job_db,
            project_db_path,
        )

        project = self._home / "proj"
        job = create_job(
            "train",
            {
                "data_dir": "/tmp/d",
                "output_dir": "/tmp/o",
                "project_dir": str(project),
            },
        )
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        stored = get_job(job.id)
        assert stored is not None
        stamp = stored.updated_at
        set_progress(job.id, 0.4)
        paused = get_job(job.id)
        assert paused is not None
        self.assertEqual(paused.status, JobStatus.CANCELLED)
        self.assertEqual(paused.updated_at, stamp)
        self.assertNotEqual(paused.progress, 0.4)

        with jobs._lock:
            mem = jobs._jobs[job.id]
            mem.status = JobStatus.RUNNING
            mem.progress = 0.8
            mem.updated_at = time.time() + 50
        jobs._sync_persist(mem)
        live = get_job(job.id)
        assert live is not None
        self.assertEqual(live.status, JobStatus.CANCELLED)
        for db in (connect(), connect(project_db_path(str(project)))):
            row = get_job_db(db, job.id)
            assert row is not None
            self.assertEqual(row["status"], "cancelled")

        merged: dict[str, dict[str, object]] = {}
        _merge_job_row(merged, {"id": "j", "status": "cancelled", "updated_at": 10})
        _merge_job_row(merged, {"id": "j", "status": "running", "updated_at": 99})
        self.assertEqual(merged["j"]["status"], "cancelled")
        self.assertEqual(merged["j"]["updated_at"], 10)

    def test_equal_timestamp_keeps_the_current_job_copy(self) -> None:
        current = jobs.Job(
            id="a",
            command="train",
            params={},
            status=JobStatus.RUNNING,
            updated_at=5,
            progress=0.2,
        )
        same_time = jobs.Job(
            id="a",
            command="train",
            params={},
            status=JobStatus.RUNNING,
            updated_at=5,
            progress=0.9,
        )
        self.assertIs(jobs._prefer_job_copy(current, same_time), current)
        newer_cancel = jobs.Job(
            id="a",
            command="train",
            params={},
            status=JobStatus.CANCELLED,
            updated_at=9,
        )
        self.assertEqual(
            jobs._prefer_job_copy(current, newer_cancel).status,
            JobStatus.CANCELLED,
        )

    def test_settle_false_returns_while_terminate_is_blocked(self) -> None:
        import threading
        import time
        from unittest.mock import patch

        release = threading.Event()
        entered = threading.Event()

        def blocked_terminate(_job_id: str) -> bool:
            entered.set()
            if not release.wait(timeout=3):
                raise RuntimeError(
                    "cancel_job waited for terminate_worker"
                )
            return False

        job = create_job(
            "train",
            {
                "data_dir": "/tmp/d",
                "output_dir": "/tmp/o",
                "project_dir": str(self._home / "proj"),
            },
        )
        set_status(job.id, JobStatus.RUNNING)
        with patch(
            "orcai_desktop_sidecar.job_cancel.terminate_worker",
            blocked_terminate,
        ):
            result = cancel_job(job.id, settle=False)
            self.assertIsNotNone(result)
            assert result is not None
            self.assertEqual(result.status, JobStatus.CANCELLED)
            self.assertTrue(entered.wait(1))
            self.assertTrue(
                any(
                    thread.name == f"cancel-{job.id[:8]}" and thread.is_alive()
                    for thread in threading.enumerate()
                )
            )
            release.set()
            deadline = time.time() + 3
            while time.time() < deadline:
                if not any(
                    thread.name == f"cancel-{job.id[:8]}" and thread.is_alive()
                    for thread in threading.enumerate()
                ):
                    break
                time.sleep(0.02)
            else:
                self.fail("background cancel thread did not finish")

    def test_direct_persist_cannot_overwrite_cancelled_row(self) -> None:
        import json
        import time

        from orcai_desktop_sidecar.jobs import job_to_dict
        from orcai_desktop_sidecar.store import (
            connect,
            get_job_db,
            persist_job_everywhere,
            project_db_path,
        )

        project = self._home / "proj"
        job = create_job(
            "train",
            {
                "data_dir": "/tmp/d",
                "output_dir": "/tmp/o",
                "project_dir": str(project),
            },
        )
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        stored = get_job(job.id)
        assert stored is not None
        payload = job_to_dict(stored)
        payload["status"] = "running"
        payload["progress"] = 0.8
        payload["updated_at"] = time.time() + 50
        payload["log"] = ["still fitting"]
        payload["error"] = None
        persist_job_everywhere(payload)

        live = get_job(job.id)
        assert live is not None
        self.assertEqual(live.status, JobStatus.CANCELLED)
        self.assertIn("Cancelled by user.", live.log)
        for db in (connect(), connect(project_db_path(str(project)))):
            row = get_job_db(db, job.id)
            assert row is not None
            self.assertEqual(row["status"], "cancelled")
            self.assertIn("Cancelled by user.", row["log"])
            self.assertNotEqual(row["progress"], 0.8)

        revived = json.dumps(["still fitting"])
        future = time.time() + 100
        for db in (connect(), connect(project_db_path(str(project)))):
            db.execute(
                "UPDATE jobs SET status = ?, updated_at = ?, log = ?, error = NULL WHERE id = ?",
                ("running", future, revived, job.id),
            )
            db.commit()
        listed = [item for item in list_jobs() if item.id == job.id]
        self.assertEqual(listed[0].status, JobStatus.CANCELLED)
        self.assertIn("Cancelled by user.", listed[0].log)

    def test_create_job_keeps_memory_when_project_dir_cannot_be_created(self) -> None:
        job = create_job("init", {"project_dir": "/p", "project_name": "p"})
        self.assertEqual(job.status, JobStatus.PENDING)
        live = get_job(job.id)
        assert live is not None
        self.assertEqual(live.id, job.id)
        self.assertEqual(live.status, JobStatus.PENDING)
        self.assertFalse(Path("/p/.orcai-desktop").exists())


if __name__ == "__main__":
    unittest.main()
