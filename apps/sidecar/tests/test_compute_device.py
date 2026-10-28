"""CPU mode must hide Metal/CUDA before orcAI touches TensorFlow."""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

from orcai_desktop_sidecar.compute_device import (
    apply_compute_device_env,
    configure_tensorflow_for_device,
    normalize_compute_device,
)


class ComputeDeviceTests(unittest.TestCase):
    def test_normalize(self) -> None:
        self.assertEqual(normalize_compute_device("CPU"), "cpu")
        self.assertEqual(normalize_compute_device("gpu"), "gpu")
        self.assertEqual(normalize_compute_device("weird"), "cpu")

    def test_apply_env_cpu_sets_cuda_hidden(self) -> None:
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)
        apply_compute_device_env("cpu")
        self.assertEqual(os.environ.get("ORCAI_COMPUTE_DEVICE"), "cpu")
        self.assertEqual(os.environ.get("CUDA_VISIBLE_DEVICES"), "-1")

    def test_apply_env_gpu_clears_cuda_hidden(self) -> None:
        os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
        apply_compute_device_env("gpu")
        self.assertEqual(os.environ.get("ORCAI_COMPUTE_DEVICE"), "gpu")
        self.assertNotIn("CUDA_VISIBLE_DEVICES", os.environ)

    def test_configure_cpu_hides_gpus(self) -> None:
        tf = MagicMock()
        with patch.dict(sys.modules, {"tensorflow": tf}):
            names = configure_tensorflow_for_device("cpu")
        self.assertEqual(names, [])
        tf.config.set_visible_devices.assert_called_with([], "GPU")
        tf.config.set_soft_device_placement.assert_called_with(True)

    def test_configure_gpu_enables_memory_growth(self) -> None:
        gpu = MagicMock()
        gpu.name = "/physical_device:GPU:0"
        tf = MagicMock()
        tf.config.list_physical_devices.return_value = [gpu]
        with patch.dict(sys.modules, {"tensorflow": tf}):
            names = configure_tensorflow_for_device("gpu")
        self.assertEqual(names, [gpu.name])
        tf.config.experimental.set_memory_growth.assert_called_with(gpu, True)
        tf.config.set_visible_devices.assert_not_called()


if __name__ == "__main__":
    unittest.main()
