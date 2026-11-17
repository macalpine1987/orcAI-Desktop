"""A0 remediation: predict mkstemp FD close + parent cancel-event clear."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from orcai_desktop_sidecar import job_cancel
from orcai_desktop_sidecar.adapters.predict import prepare_predict_recording_path
from orcai_desktop_sidecar.job_cancel import clear as clear_cancel
from orcai_desktop_sidecar.job_cancel import register as register_cancel


class PredictMkstempFdTests(unittest.TestCase):
    def test_selection_temp_csv_closes_mkstemp_fd(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            table = Path(tmp) / "recording_table.csv"
            table.write_text(
                "recording,base_dir_recording\na.wav,/data\nb.wav,/data\n",
                encoding="utf-8",
            )
            closed: list[int] = []
            real_close = os.close

            def track_close(fd: int) -> None:
                closed.append(fd)
                real_close(fd)

            with mock.patch("orcai_desktop_sidecar.adapters.predict.os.close", track_close):
                path, cleanup = prepare_predict_recording_path(
                    table,
                    recording_names=["a"],
                    job_id="job-fd",
                    project_dir=None,
                )
            self.assertTrue(closed, "mkstemp fd must be closed before rewrite")
            self.assertTrue(path.is_file())
            self.assertIsNotNone(cleanup)
            path.unlink(missing_ok=True)

    def test_selection_temp_csv_unlinked_when_write_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            table = Path(tmp) / "recording_table.csv"
            table.write_text(
                "recording,base_dir_recording\na.wav,/data\nb.wav,/data\n",
                encoding="utf-8",
            )
            orphan: list[Path] = []
            real_mkstemp = tempfile.mkstemp
            real_open = Path.open

            def track_mkstemp(*args: object, **kwargs: object):
                fd, name = real_mkstemp(*args, **kwargs)
                orphan.append(Path(name))
                return fd, name

            def selective_open(self: Path, *args: object, **kwargs: object):
                # First open reads the source CSV; fail the temp write.
                if orphan and self == orphan[-1]:
                    raise OSError("disk full")
                return real_open(self, *args, **kwargs)

            with (
                mock.patch(
                    "orcai_desktop_sidecar.adapters.predict.tempfile.mkstemp",
                    track_mkstemp,
                ),
                mock.patch.object(Path, "open", selective_open),
            ):
                with self.assertRaises(OSError):
                    prepare_predict_recording_path(
                        table,
                        recording_names=["a"],
                        job_id="job-orphan",
                        project_dir=None,
                    )
            self.assertTrue(orphan)
            for path in orphan:
                self.assertFalse(path.exists(), f"orphan left behind: {path}")


class CancelEventsClearTests(unittest.TestCase):
    def tearDown(self) -> None:
        with job_cancel._lock:  # noqa: SLF001 — test inspects registry
            job_cancel._cancel_events.clear()
            job_cancel._workers.clear()
            job_cancel._threads.clear()

    def test_clear_drops_cancel_event(self) -> None:
        job_id = "a0-cancel-clear"
        register_cancel(job_id)
        with job_cancel._lock:  # noqa: SLF001
            self.assertIn(job_id, job_cancel._cancel_events)
        clear_cancel(job_id)
        with job_cancel._lock:  # noqa: SLF001
            self.assertNotIn(job_id, job_cancel._cancel_events)


if __name__ == "__main__":
    unittest.main()
