"""JobMessenger device-log rewrites (hpsearch CPU/GPU banners)."""

from __future__ import annotations

import unittest

from orcai_desktop_sidecar.messenger import rewrite_device_log_line


class TestRewriteDeviceLogLine(unittest.TestCase):
    def test_sequential_gpu_banner_on_cpu(self) -> None:
        self.assertEqual(
            rewrite_device_log_line("Sequential - running on 1 GPU", "cpu"),
            "Sequential - running on CPU",
        )

    def test_parallel_gpu_banner_on_cpu(self) -> None:
        self.assertEqual(
            rewrite_device_log_line("Parallel - running on 2 GPU", "cpu"),
            "Parallel - running on CPU (no GPU visible)",
        )

    def test_gpu_mode_keeps_upstream_text(self) -> None:
        raw = "Sequential - running on 1 GPU"
        self.assertEqual(rewrite_device_log_line(raw, "gpu"), raw)

    def test_unrelated_line_unchanged(self) -> None:
        raw = "Searching hyperparameters"
        self.assertEqual(rewrite_device_log_line(raw, "cpu"), raw)


if __name__ == "__main__":
    unittest.main()
