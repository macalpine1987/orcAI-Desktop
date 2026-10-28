"""Unit coverage: NFR-8/19/20 — explicit errors, cancel hygiene, path stability, ruff gates."""

from __future__ import annotations

import os
import re
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ORCAI_FORCE_INPROCESS_JOBS", "1")

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.cancel_cleanup import cleanup_partial_artifacts
from orcai_desktop_sidecar.cli_command import build_command_line
from orcai_desktop_sidecar.engine_call import engine_kwargs
from orcai_desktop_sidecar.job_cancel import clear_worker, register_thread, wait_worker_stopped
from orcai_desktop_sidecar.job_queue import JobScheduler
from orcai_desktop_sidecar.jobs import (
    JobStatus,
    cancel_job,
    create_job,
    get_job,
    set_status,
)
from orcai_desktop_sidecar.runner import run_job

_SIDECAR_SRC = Path(__file__).resolve().parents[1] / "src" / "orcai_desktop_sidecar"
_PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def _reset_jobs() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class _JobsFixture(unittest.TestCase):
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


# ---------------------------------------------------------------------------
# NFR-19 gate: ruff config + noqa discipline
# ---------------------------------------------------------------------------


class RuffGateTests(unittest.TestCase):
    def test_pyproject_enables_ruff_without_global_disable(self) -> None:
        text = _PYPROJECT.read_text(encoding="utf-8")
        self.assertIn("[tool.ruff]", text)
        self.assertIn("[tool.ruff.lint]", text)
        self.assertIn('"E"', text)
        self.assertIn('"F"', text)
        self.assertIn('"BLE"', text)
        self.assertIn('"S110"', text)
        # Must not ignore everything / disable lint wholesale.
        self.assertNotIn("lint.select = []", text.replace(" ", ""))
        ignore_block = text.split("[tool.ruff.lint]")[1].split("[")[0]
        self.assertNotIn('"BLE001"', ignore_block)
        self.assertNotIn('"S110"', ignore_block)

    def test_ble001_noqa_always_has_inline_reason(self) -> None:
        bare: list[str] = []
        reasoned = 0
        pattern = re.compile(r"#\s*noqa:\s*BLE001(.*)$")
        for path in _SIDECAR_SRC.rglob("*.py"):
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                match = pattern.search(line)
                if not match:
                    continue
                rest = match.group(1)
                #: reason after noqa (em dash used in codebase).
                if "—" not in rest:
                    bare.append(f"{path.name}:{lineno}:{line.strip()}")
                else:
                    reasoned += 1
        self.assertEqual(bare, [], msg="BLE001 noqa without reason:\n" + "\n".join(bare))
        self.assertGreaterEqual(reasoned, 10)


# ---------------------------------------------------------------------------
# NFR-8 /: explicit errors, never silent swallow at job boundary
# ---------------------------------------------------------------------------


class ExplicitErrorTests(_JobsFixture):
    def test_run_job_preserves_engine_exception_text(self) -> None:
        job = create_job("predict", {"recording_path": str(self._home / "a.wav")})

        def boom(job_id: str, params: dict) -> dict:
            raise RuntimeError("orcAI original: channel out of range")

        with patch.dict("orcai_desktop_sidecar.runner._HANDLERS", {"predict": boom}, clear=False):
            run_job(job.id, "predict", job.params)

        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.FAILED)
        self.assertEqual(refreshed.exit_code, 1)
        self.assertEqual(refreshed.error, "orcAI original: channel out of range")
        self.assertTrue(any("orcAI original: channel out of range" in ln for ln in refreshed.log))
        self.assertTrue(any(ln.startswith("Error:") for ln in refreshed.log))

    def test_persist_failure_is_logged_and_job_stays_in_memory(self) -> None:
        job = create_job("init", {"project_dir": str(self._home), "project_name": "p"})
        with (
            patch(
                "orcai_desktop_sidecar.jobs.persist_job_everywhere",
                side_effect=OSError("disk full"),
            ),
            self.assertLogs("orcai_desktop_sidecar.jobs", level="DEBUG") as captured,
        ):
            set_status(job.id, JobStatus.RUNNING)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.RUNNING)
        self.assertTrue(
            any("persist_job_everywhere failed" in msg for msg in captured.output),
            msg=captured.output,
        )

    def test_cancel_cleanup_failure_logged_but_cancel_succeeds(self) -> None:
        out = self._home / "train-out"
        out.mkdir()
        job = create_job(
            "train",
            {"data_dir": str(self._home / "d"), "output_dir": str(out)},
        )
        set_status(job.id, JobStatus.RUNNING)

        # cleanup_partial_artifacts must swallow inner failures, log, return [].
        with (
            self.assertLogs("orcai_desktop_sidecar.cancel_cleanup", level="ERROR") as captured,
            patch(
                "orcai_desktop_sidecar.cancel_cleanup._mark_incomplete",
                side_effect=RuntimeError("inner cleanup boom"),
            ),
        ):
            removed = cleanup_partial_artifacts(
                "train", {"output_dir": str(out), "data_dir": str(self._home)}
            )
        self.assertEqual(removed, [])
        self.assertTrue(any("cancel cleanup failed" in msg for msg in captured.output))

        # cancel_job still reaches CANCELLED even when cleanup returns empty.
        with patch(
            "orcai_desktop_sidecar.cancel_cleanup.cleanup_partial_artifacts",
            return_value=[],
        ):
            cancel_job(job.id)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.CANCELLED)
        self.assertEqual(refreshed.exit_code, 130)

    def test_tqdm_restore_failure_does_not_mask_completed_job(self) -> None:
        artifact = self._home / "ok.txt"
        artifact.write_text("x", encoding="utf-8")
        job = create_job("predict", {"recording_path": str(self._home / "a.wav")})

        def handler(job_id: str, params: dict) -> dict:
            return {"created_files": [str(artifact.resolve())]}

        def bad_restore() -> None:
            raise RuntimeError("tqdm restore failed")

        with (
            patch.dict(
                "orcai_desktop_sidecar.runner._HANDLERS",
                {"predict": handler},
                clear=False,
            ),
            patch(
                "orcai_desktop_sidecar.progress_tqdm.install_job_tqdm",
                return_value=bad_restore,
            ),
            self.assertLogs("orcai_desktop_sidecar.runner", level="DEBUG") as captured,
        ):
            run_job(job.id, "predict", job.params)

        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.COMPLETED)
        self.assertEqual(refreshed.exit_code, 0)
        self.assertTrue(any("restore_tqdm failed" in msg for msg in captured.output))


# ---------------------------------------------------------------------------
# NFR-6 / NFR-20 п.10: cancel hygiene + worker wait
# ---------------------------------------------------------------------------


class CancelStabilityTests(_JobsFixture):
    def test_cancel_order_terminate_before_cleanup(self) -> None:
        order: list[str] = []
        wav = self._home / "rec.wav"
        wav.write_bytes(b"RIFF")
        label = self._home / "out.txt"
        label.write_text("partial", encoding="utf-8")
        job = create_job(
            "predict",
            {"recording_path": str(wav), "output_path": str(label)},
        )
        set_status(job.id, JobStatus.RUNNING)

        def fake_terminate(job_id: str) -> bool:
            order.append("terminate")
            return True

        def fake_wait(job_id: str, *, timeout: float = 2.0) -> bool:
            order.append("wait")
            return True

        def fake_cleanup(command: str, params: dict, **_kw) -> list[str]:
            order.append("cleanup")
            return []

        with (
            patch(
                "orcai_desktop_sidecar.job_cancel.terminate_worker",
                side_effect=fake_terminate,
            ),
            patch(
                "orcai_desktop_sidecar.job_cancel.wait_worker_stopped",
                side_effect=fake_wait,
            ),
            patch(
                "orcai_desktop_sidecar.cancel_cleanup.cleanup_partial_artifacts",
                side_effect=fake_cleanup,
            ),
        ):
            cancel_job(job.id)

        self.assertEqual(order[0], "terminate")
        self.assertEqual(order[1], "wait")
        self.assertIn("cleanup", order)
        self.assertLess(order.index("wait"), order.index("cleanup"))

    def test_wait_worker_stopped_joins_registered_thread(self) -> None:
        done = threading.Event()

        def target() -> None:
            time.sleep(0.15)
            done.set()

        thread = threading.Thread(target=target, daemon=True)
        job_id = "wait-thread-job"
        register_thread(job_id, thread)
        thread.start()
        stopped = wait_worker_stopped(job_id, timeout=2.0)
        self.assertTrue(stopped)
        self.assertTrue(done.is_set())
        clear_worker(job_id)

    def test_all_twelve_commands_have_cancel_policy(self) -> None:
        """NFR-6: every orcAI CLI command is handled by cleanup_partial_artifacts."""
        twelve = (
            "init",
            "create-recording-table",
            "predict",
            "filter-predictions",
            "create-spectrograms",
            "create-label-arrays",
            "create-snippet-table",
            "create-tvt-snippet-tables",
            "create-tvt-data",
            "hpsearch",
            "train",
            "test",
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for cmd in twelve:
                # Should not raise; returns list (possibly empty if paths missing).
                removed = cleanup_partial_artifacts(cmd, {"project_dir": str(root)})
                self.assertIsInstance(removed, list, msg=cmd)


# ---------------------------------------------------------------------------
# NFR-7: identical params → identical path / command_line contract
# ---------------------------------------------------------------------------


class PathContractStabilityTests(unittest.TestCase):
    def test_repeated_predict_cli_is_stable(self) -> None:
        params = {
            "recording_path": "/data/rec.wav",
            "channel": 2,
            "threshold": 0.4,
            "model": "orcai-isl-v1",
        }
        lines = [build_command_line("predict", params) for _ in range(5)]
        self.assertEqual(len(set(lines)), 1)
        self.assertIn("/data/rec.wav", lines[0])
        self.assertIn("-c", lines[0])
        self.assertIn("-th", lines[0])

    def test_engine_kwargs_pass_through_stable_across_calls(self) -> None:
        def fake_predict(
            recording_path: str,
            channel: int = 1,
            threshold: float = 0.5,
        ) -> None:
            return None

        params = {"recording_path": "/tmp/a.wav"}
        first = engine_kwargs(fake_predict, params)
        second = engine_kwargs(fake_predict, params)
        self.assertEqual(first, second)
        self.assertEqual(first, {"recording_path": "/tmp/a.wav"})

    def test_predict_artifact_name_contract_stable(self) -> None:
        from importlib.resources import files

        from orcai_desktop_sidecar.adapters.predict import resolve_predict_output_path

        model_dir = Path(str(files("orcai.models").joinpath("orcai-isl-v1")))
        paths = [
            resolve_predict_output_path("/proj/sample.wav", 1, model_dir, "default")
            for _ in range(3)
        ]
        self.assertEqual({p.name for p in paths}, {paths[0].name})
        self.assertTrue(paths[0].name.endswith("_predicted.txt"))


# ---------------------------------------------------------------------------
# Scheduler stability (NFR-20): slot release + logging on start_fn failure
# ---------------------------------------------------------------------------


class SchedulerStabilityTests(unittest.TestCase):
    def test_start_fn_exception_logs_and_releases_slot(self) -> None:
        started: list[str] = []
        finished = threading.Event()

        def boom(job_id: str, command: str, params: dict) -> None:
            raise RuntimeError("start failed")

        def ok(job_id: str, command: str, params: dict) -> None:
            started.append(job_id)
            finished.set()
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=1)
        with self.assertLogs("orcai_desktop_sidecar.job_queue", level="ERROR") as captured:
            sched.submit("a", "predict", {}, boom, priority=0)
            time.sleep(0.12)
            sched.submit("b", "predict", {}, ok, priority=0)
            self.assertTrue(finished.wait(timeout=2.0))
        self.assertEqual(started, ["b"])
        self.assertTrue(any("job start failed" in msg for msg in captured.output))
        snap = sched.snapshot()
        self.assertNotIn("a", snap["running"])


# ---------------------------------------------------------------------------
# Progress (NFR-4): tqdm reports into job.progress
# ---------------------------------------------------------------------------


class ProgressReportingTests(_JobsFixture):
    def test_install_job_tqdm_updates_progress(self) -> None:
        from orcai_desktop_sidecar.progress_tqdm import install_job_tqdm

        job = create_job("predict", {"recording_path": "/a.wav"})
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


if __name__ == "__main__":
    unittest.main()
