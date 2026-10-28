"""Command line, queue concurrency, cancel cleanup markers."""

from __future__ import annotations

import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.cli_command import build_command_line, normalize_job_params
from orcai_desktop_sidecar.job_queue import JobScheduler
from orcai_desktop_sidecar.jobs import JobStatus, cancel_job, create_job, get_job, set_status


def _reset_jobs_module() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class CliCommandTests(unittest.TestCase):
    def test_predict_command_line_includes_flags(self) -> None:
        line = build_command_line(
            "predict",
            {
                "recording_path": "/tmp/a.wav",
                "channel": 1,
                "threshold": 0.5,
                "model": "orcai-isl-v1",
            },
        )
        self.assertIn("orcai", line)
        self.assertIn("predict", line)
        self.assertIn("/tmp/a.wav", line)
        self.assertIn("-th", line)
        self.assertNotIn("-r", line)  # positional, not -r

    def test_omits_absent_optional_params(self) -> None:
        line = build_command_line("predict", {"recording_path": "/tmp/a.wav"})
        self.assertNotIn("-th", line)
        self.assertNotIn("-m", line)

    def test_create_tvt_data_no_phantom_output_dir(self) -> None:
        line = build_command_line(
            "create-tvt-data",
            {
                "tvt_snippet_tables_dir": "/tmp/tvt",
                "output_dir": "/tmp/out",
                "orcai_parameter": "/tmp/p.json",
            },
        )
        self.assertIn("/tmp/tvt", line)
        self.assertIn("-p", line)
        self.assertNotIn("/tmp/out", line)
        self.assertNotIn(" -o ", f" {line} ")

    def test_normalize_aliases(self) -> None:
        n = normalize_job_params(
            "create-snippet-table",
            {"output_path": "/tmp/s.csv", "recording_table_path": "/tmp/rt.csv"},
        )
        self.assertEqual(n["output_dir"], "/tmp/s.csv")
        self.assertNotIn("output_path", n)


class EngineKwargsTests(unittest.TestCase):
    def test_pass_through_omits_engine_defaults(self) -> None:
        from orcai_desktop_sidecar.engine_call import engine_kwargs

        def fake_predict(
            recording_path: str,
            channel: int = 1,
            threshold: float = 0.5,
            verbosity: int = 2,
        ) -> None:
            return None

        kwargs = engine_kwargs(fake_predict, {"recording_path": "/tmp/a.wav"})
        self.assertEqual(kwargs, {"recording_path": "/tmp/a.wav"})
        kwargs2 = engine_kwargs(
            fake_predict,
            {"recording_path": "/tmp/a.wav", "channel": 3},
            inject={"verbosity": 1},
        )
        self.assertEqual(
            kwargs2, {"recording_path": "/tmp/a.wav", "channel": 3, "verbosity": 1}
        )

    def test_explicit_none_is_passed(self) -> None:
        from orcai_desktop_sidecar.engine_call import engine_kwargs

        def fake(x: int | None = 1) -> None:
            return None

        self.assertEqual(engine_kwargs(fake, {"x": None}), {"x": None})


class AbsoluteArtifactsTests(unittest.TestCase):
    def test_does_not_pollute_with_input_paths(self) -> None:
        from orcai_desktop_sidecar.runner import _absolute_created_files

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wav = root / "a.wav"
            wav.write_bytes(b"RIFF")
            label = root / "a_predicted.txt"
            label.write_text("x", encoding="utf-8")
            data = root / "data"
            data.mkdir()
            out = root / "out"
            out.mkdir()
            created = out / "w.bin"
            created.write_bytes(b"1")

            predict_arts = _absolute_created_files(
                {
                    "recording_path": str(wav),
                    "wav_path": str(wav),
                    "label_path": str(label),
                    "created_files": [str(label)],
                }
            )
            self.assertEqual(predict_arts, [str(label.resolve())])

            train_arts = _absolute_created_files(
                {
                    "data_dir": str(data),
                    "model_dir": str(data),
                    "output_dir": str(out),
                    "created_files": [str(created)],
                }
            )
            self.assertEqual(train_arts, [str(created.resolve())])
            self.assertNotIn(str(data.resolve()), train_arts)


class ProgressTqdmTests(unittest.TestCase):
    def test_install_reports_progress(self) -> None:
        from orcai_desktop_sidecar import jobs
        from orcai_desktop_sidecar.progress_tqdm import install_job_tqdm

        with tempfile.TemporaryDirectory() as tmp, patch(
            "orcai_desktop_sidecar.store._APP_DIR", Path(tmp)
        ):
            jobs._bootstrapped = False
            jobs._jobs.clear()
            job = create_job("init", {"project_dir": "/tmp/p", "project_name": "p"})
            restore = install_job_tqdm(job.id)
            try:
                import tqdm

                bar = tqdm.tqdm(total=10)
                bar.update(5)
                bar.close()
            finally:
                restore()
            refreshed = get_job(job.id)
            assert refreshed is not None
            self.assertAlmostEqual(refreshed.progress or 0.0, 0.5, places=2)
            jobs._bootstrapped = False
            jobs._jobs.clear()

    def test_already_imported_from_tqdm_import_tqdm(self) -> None:
        """orcAI spectrogram/labels/snippets bind ``from tqdm import tqdm`` at import."""
        from tqdm import tqdm as already_bound

        from orcai_desktop_sidecar import jobs
        from orcai_desktop_sidecar.progress_tqdm import install_job_tqdm

        with tempfile.TemporaryDirectory() as tmp, patch(
            "orcai_desktop_sidecar.store._APP_DIR", Path(tmp)
        ):
            jobs._bootstrapped = False
            jobs._jobs.clear()
            job = create_job(
                "create-spectrograms",
                {"recording_table_path": "/tmp/t.csv", "output_dir": "/tmp/o"},
            )
            restore = install_job_tqdm(job.id)
            try:
                bar = already_bound(total=8)
                bar.update(2)
                bar.close()
            finally:
                restore()
            refreshed = get_job(job.id)
            assert refreshed is not None
            self.assertAlmostEqual(refreshed.progress or 0.0, 0.25, places=2)
            jobs._bootstrapped = False
            jobs._jobs.clear()

    def test_tqdm_callback_epoch_bar_reports_progress(self) -> None:
        """orcAI train uses TqdmCallback(verbose=0); epoch bar must hit job.progress."""
        from orcai_desktop_sidecar import jobs
        from orcai_desktop_sidecar.progress_tqdm import install_job_tqdm

        with tempfile.TemporaryDirectory() as tmp, patch(
            "orcai_desktop_sidecar.store._APP_DIR", Path(tmp)
        ):
            jobs._bootstrapped = False
            jobs._jobs.clear()
            job = create_job("train", {"data_dir": "/tmp/d", "output_dir": "/tmp/o"})
            restore = install_job_tqdm(job.id)
            try:
                from tqdm.keras import TqdmCallback

                cb = TqdmCallback(epochs=10, data_size=64, batch_size=32, verbose=0)
                cb.params = {"epochs": 10}
                cb.on_train_begin()
                # Simulate end of epoch 0 and 1 (bar2callback → update(1)).
                cb.on_epoch_end(0, logs={})
                mid = get_job(job.id)
                assert mid is not None
                self.assertAlmostEqual(mid.progress or 0.0, 0.1, places=2)
                cb.on_epoch_end(1, logs={})
                after = get_job(job.id)
                assert after is not None
                self.assertAlmostEqual(after.progress or 0.0, 0.2, places=2)
                cb.on_train_end()
            finally:
                restore()
            jobs._bootstrapped = False
            jobs._jobs.clear()


class CollectCreatedTests(unittest.TestCase):
    def test_skips_missing_and_uses_before_snapshot(self) -> None:
        from orcai_desktop_sidecar.engine_call import collect_created, snapshot_files

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old.txt"
            old.write_text("x", encoding="utf-8")
            before = snapshot_files(root)
            new = root / "new.txt"
            new.write_text("y", encoding="utf-8")
            created = collect_created(
                root / "missing.txt",
                before=before,
                root=root,
            )
            self.assertNotIn(str((root / "missing.txt").resolve()), created)
            self.assertIn(str(new.resolve()), created)
            self.assertNotIn(str(old.resolve()), created)


class JobContractTests(unittest.TestCase):
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

    def test_create_job_sets_command_line(self) -> None:
        job = create_job("predict", {"recording_path": "/data/x.wav", "channel": 2})
        self.assertIsNotNone(job.command_line)
        assert job.command_line is not None
        self.assertIn("predict", job.command_line)
        self.assertIn("-c", job.command_line)
        d = jobs.job_to_dict(job)
        self.assertEqual(d["command_line"], job.command_line)
        self.assertEqual(d["priority"], 0)
        self.assertEqual(d["artifacts"], [])

    def test_completed_sets_exit_code_and_artifacts(self) -> None:
        job = create_job("init", {"project_dir": "/tmp/p", "project_name": "p"})
        set_status(
            job.id,
            JobStatus.COMPLETED,
            result={"created_files": ["/tmp/p/recording_table.csv"]},
            artifacts=["/tmp/p/recording_table.csv"],
        )
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.exit_code, 0)
        self.assertEqual(refreshed.progress, 1.0)
        self.assertEqual(refreshed.artifacts, ["/tmp/p/recording_table.csv"])

    def test_cancel_pending_sets_exit_code_130(self) -> None:
        job = create_job("train", {"data_dir": "/tmp/d", "output_dir": "/tmp/o", "orcai_parameter": "/tmp/p.json"})
        cancel_job(job.id)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.CANCELLED)
        self.assertEqual(refreshed.exit_code, 130)

    def test_cancel_cascades_pending_plan_siblings(self) -> None:
        """Wizard plan_id: cancelling train also cancels pending test (and peers)."""
        from orcai_desktop_sidecar import jobs as jobs_mod

        with tempfile.TemporaryDirectory() as tmp, patch(
            "orcai_desktop_sidecar.store._APP_DIR", Path(tmp)
        ):
            jobs_mod._bootstrapped = False
            jobs_mod._jobs.clear()
            plan = "plan-wizard-1"
            train = create_job(
                "train",
                {
                    "data_dir": "/tmp/d",
                    "output_dir": "/tmp/o",
                    "orcai_parameter": "/tmp/p.json",
                    "plan_id": plan,
                },
            )
            test = create_job(
                "test",
                {
                    "model_dir": "/tmp/m",
                    "data_dir": "/tmp/d",
                    "plan_id": plan,
                },
            )
            other = create_job(
                "predict",
                {"recording_path": "/tmp/a.wav", "plan_id": "other-plan"},
            )
            # Pretend train is running so cascade targets pending only.
            with jobs_mod._lock:
                train_job = jobs_mod._jobs[train.id]
                train_job.status = JobStatus.RUNNING
            cancel_job(train.id)
            self.assertEqual(get_job(train.id).status, JobStatus.CANCELLED)
            self.assertEqual(get_job(test.id).status, JobStatus.CANCELLED)
            self.assertEqual(get_job(other.id).status, JobStatus.PENDING)
            jobs_mod._bootstrapped = False
            jobs_mod._jobs.clear()


class SchedulerTests(unittest.TestCase):
    def test_max_concurrent_one(self) -> None:
        started: list[str] = []
        release = threading.Event()
        lock = threading.Lock()

        def start_fn(job_id: str, command: str, params: dict) -> None:
            with lock:
                started.append(job_id)

            def worker() -> None:
                release.wait(timeout=2)
                sched.notify_finished(job_id)

            threading.Thread(target=worker, daemon=True).start()

        sched = JobScheduler(max_concurrent=1)
        sched.submit("a", "predict", {}, start_fn, priority=0)
        sched.submit("b", "predict", {}, start_fn, priority=0)
        time.sleep(0.15)
        with lock:
            self.assertEqual(started, ["a"])
        release.set()
        time.sleep(0.2)
        with lock:
            self.assertEqual(started, ["a", "b"])

    def test_set_max_concurrent_live(self) -> None:
        started: list[str] = []
        release = threading.Event()
        lock = threading.Lock()

        def start_fn(job_id: str, command: str, params: dict) -> None:
            with lock:
                started.append(job_id)

            def worker() -> None:
                release.wait(timeout=2)
                sched.notify_finished(job_id)

            threading.Thread(target=worker, daemon=True).start()

        sched = JobScheduler(max_concurrent=1)
        sched.submit("a", "predict", {}, start_fn, priority=0)
        sched.submit("b", "predict", {}, start_fn, priority=0)
        time.sleep(0.12)
        with lock:
            self.assertEqual(started, ["a"])
        sched.set_max_concurrent(2)
        time.sleep(0.12)
        with lock:
            self.assertEqual(started, ["a", "b"])
        release.set()

    def test_higher_priority_runs_first(self) -> None:
        order: list[str] = []
        gate = threading.Event()

        def start_fn(job_id: str, command: str, params: dict) -> None:
            order.append(job_id)
            gate.set()
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=1)
        blocker = threading.Event()

        def block_fn(job_id: str, command: str, params: dict) -> None:
            blocker.wait(timeout=2)
            sched.notify_finished(job_id)

        sched.submit("hold", "predict", {}, block_fn, priority=0)
        time.sleep(0.05)
        sched.submit("low", "predict", {}, start_fn, priority=0)
        sched.submit("high", "predict", {}, start_fn, priority=10)
        blocker.set()
        self.assertTrue(gate.wait(timeout=2))
        time.sleep(0.15)
        self.assertEqual(order[0], "high")
        self.assertEqual(order[1], "low")


if __name__ == "__main__":
    unittest.main()
