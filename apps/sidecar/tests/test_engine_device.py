"""Tests for engine device switching."""

from __future__ import annotations

import sys
import unittest
from unittest.mock import MagicMock, patch

from orcai_desktop_sidecar import engine


def _mock_runner() -> None:
    runner = MagicMock()
    runner.orcai_available = MagicMock(return_value=True)
    sys.modules["orcai_desktop_sidecar.runner"] = runner


class EngineDeviceSwitchTests(unittest.TestCase):
    def setUp(self) -> None:
        engine.stop_engine()
        self._runner_mod = sys.modules.get("orcai_desktop_sidecar.runner")
        _mock_runner()

    def tearDown(self) -> None:
        engine.stop_engine()
        if self._runner_mod is None:
            sys.modules.pop("orcai_desktop_sidecar.runner", None)
        else:
            sys.modules["orcai_desktop_sidecar.runner"] = self._runner_mod

    def test_restart_when_device_changes(self) -> None:
        mock_proc = MagicMock()
        mock_proc.is_alive.return_value = True
        mock_parent = MagicMock()
        mock_child = MagicMock()
        mock_parent.poll.return_value = True
        mock_parent.recv.return_value = {
            "status": "ready",
            "device": "cpu",
            "gpu_devices": [],
            "gpu_backend": None,
        }

        mock_ctx = MagicMock()
        mock_ctx.Process.return_value = mock_proc
        mock_ctx.Pipe.return_value = (mock_parent, mock_child)

        with (
            patch("orcai_desktop_sidecar.engine._mp_context", return_value=mock_ctx),
            patch("orcai_desktop_sidecar.engine._shutdown_engine_process"),
            patch("orcai_desktop_sidecar.engine.threading.Thread") as thread_cls,
        ):
            thread_cls.return_value.start = lambda: None
            engine.start_engine_warmup("cpu")
            with engine._lock:
                engine._status = "ready"
                engine._device = "cpu"
                engine._active_device = "cpu"

            engine.start_engine_warmup("gpu")
            with engine._lock:
                self.assertEqual(engine._status, "warming")
                self.assertEqual(engine._device, "gpu")

    def test_runtime_info_reports_warming_stage(self) -> None:
        mock_proc = MagicMock()
        mock_ctx = MagicMock()
        mock_ctx.Process.return_value = mock_proc
        mock_ctx.Pipe.return_value = (MagicMock(), MagicMock())

        with (
            patch("orcai_desktop_sidecar.engine._mp_context", return_value=mock_ctx),
            patch("orcai_desktop_sidecar.engine._shutdown_engine_process"),
            patch("orcai_desktop_sidecar.engine.threading.Thread") as thread_cls,
        ):
            thread_cls.return_value.start = lambda: None
            engine.start_engine_warmup("cpu")
            info = engine.engine_runtime_info()
            self.assertEqual(info["engine"], "warming")
            self.assertIn(
                info["engine_stage"],
                ("checking_orcai", "configuring_device"),
            )
            self.assertGreater(info["engine_progress"], 0.0)

    def test_watchdog_marks_error_when_child_exits(self) -> None:
        mock_proc = MagicMock()
        mock_proc.is_alive.return_value = False
        with (
            patch("orcai_desktop_sidecar.engine._shutdown_engine_process"),
            patch("orcai_desktop_sidecar.engine.time.sleep", return_value=None),
            patch("orcai_desktop_sidecar.engine.invalidate_accelerator_cache"),
        ):
            with engine._lock:
                engine._status = "ready"
                engine._warmup_generation = 7
                generation = engine._warmup_generation
            engine._engine_process_watchdog(mock_proc, generation)
            info = engine.engine_runtime_info()
            self.assertEqual(info["engine"], "error")
            self.assertIn("exited", info.get("engine_error") or "")

    def test_noop_when_same_device_already_ready(self) -> None:
        with (
            patch("orcai_desktop_sidecar.engine._shutdown_engine_process") as shutdown,
            patch("orcai_desktop_sidecar.engine.threading.Thread") as thread_cls,
        ):
            thread_cls.return_value.start = lambda: None
            with engine._lock:
                engine._status = "ready"
                engine._device = "cpu"
                engine._active_device = "cpu"
            engine.start_engine_warmup("cpu")
            shutdown.assert_not_called()
            thread_cls.assert_not_called()


if __name__ == "__main__":
    unittest.main()
