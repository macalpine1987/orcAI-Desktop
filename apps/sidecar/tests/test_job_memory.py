"""Memory guard helpers for job workers (cancel must not thrash the host)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from orcai_desktop_sidecar.job_cancel import _terminate_process
from orcai_desktop_sidecar.job_memory import HEAVY_TF_COMMANDS, physical_ram_bytes


class JobMemoryTests(unittest.TestCase):
    def test_train_is_heavy_tf_command(self) -> None:
        self.assertIn("train", HEAVY_TF_COMMANDS)
        self.assertIn("hpsearch", HEAVY_TF_COMMANDS)

    def test_physical_ram_bytes_positive_on_posix(self) -> None:
        n = physical_ram_bytes()
        if n is not None:
            self.assertGreater(n, 512 * 1024 * 1024)

    def test_immediate_terminate_uses_kill_not_long_term(self) -> None:
        proc = MagicMock()
        proc.pid = 4242
        proc.is_alive.side_effect = [True, False]
        with patch("orcai_desktop_sidecar.job_cancel._kill_process_tree") as kill_tree:
            _terminate_process(proc, immediate=True)
            kill_tree.assert_called_once_with(4242)
            proc.terminate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
