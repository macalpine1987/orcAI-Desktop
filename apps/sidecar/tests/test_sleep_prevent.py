"""Idle-sleep inhibit while training / TF jobs run."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from orcai_desktop_sidecar.sleep_prevent import (
    KEEP_AWAKE_COMMANDS,
    hold_keep_awake,
    is_keep_awake_active,
    release_keep_awake,
    reset_keep_awake_for_tests,
)


class SleepPreventTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_keep_awake_for_tests()

    def test_train_commands_are_keep_awake(self) -> None:
        for cmd in (
            "create-spectrograms",
            "train",
            "test",
            "hpsearch",
            "create-tvt-data",
            "create-snippet-table",
            "create-tvt-snippet-tables",
        ):
            self.assertIn(cmd, KEEP_AWAKE_COMMANDS)
        self.assertNotIn("predict", KEEP_AWAKE_COMMANDS)
        self.assertNotIn("init", KEEP_AWAKE_COMMANDS)

    def test_hold_release_toggles_caffeinate_on_darwin(self) -> None:
        proc = MagicMock()
        proc.poll.return_value = None
        with (
            patch("orcai_desktop_sidecar.sleep_prevent.sys.platform", "darwin"),
            patch(
                "orcai_desktop_sidecar.sleep_prevent.subprocess.Popen",
                return_value=proc,
            ) as popen,
        ):
            hold_keep_awake("job-a")
            self.assertTrue(is_keep_awake_active())
            popen.assert_called_once()
            args = popen.call_args[0][0]
            self.assertEqual(args[0], "caffeinate")
            self.assertIn("-i", args)
            self.assertIn("-w", args)

            # Second hold does not spawn another caffeinate.
            hold_keep_awake("job-b")
            self.assertEqual(popen.call_count, 1)

            release_keep_awake("job-a")
            self.assertTrue(is_keep_awake_active())
            proc.terminate.assert_not_called()

            release_keep_awake("job-b")
            self.assertFalse(is_keep_awake_active())
            proc.terminate.assert_called()

    def test_release_unknown_job_is_noop(self) -> None:
        release_keep_awake("missing")
        self.assertFalse(is_keep_awake_active())


if __name__ == "__main__":
    unittest.main()
