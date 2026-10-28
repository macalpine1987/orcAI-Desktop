"""End-to-end scenarios: import high-rate / 32-bit WAV into a project."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.project_registry import (
    create_project,
    import_recordings,
    list_project_recordings,
)


def _require_audio_stack() -> None:
    try:
        import numpy  # noqa: F401
        import soundfile  # noqa: F401
    except ImportError as exc:
        raise unittest.SkipTest("soundfile/numpy not installed") from exc


def _write_hf_wav(path: Path, *, sr: int, subtype: str) -> None:
    import numpy as np
    import soundfile as sf

    frames = min(sr, 8000)
    if subtype == "PCM_32":
        data = np.zeros(frames, dtype=np.int32)
    elif subtype == "PCM_24":
        data = np.zeros(frames, dtype=np.float32)
    else:
        data = np.zeros(frames, dtype=np.int16)
    sf.write(path, data, sr, subtype=subtype)


class WavImportScenarioTests(unittest.TestCase):
    def setUp(self) -> None:
        _require_audio_stack()
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_import_384khz_32bit_lists_metadata(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="HF Import")
        src = self._home / "ultrasonic.wav"
        _write_hf_wav(src, sr=384_000, subtype="PCM_32")

        imported = import_recordings(created["id"], [str(src)])
        self.assertEqual(imported[0]["sample_rate_hz"], 384_000)
        self.assertEqual(imported[0]["bit_depth"], 32)

        listed = list_project_recordings(created["id"])
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["sample_rate_hz"], 384_000)
        self.assertEqual(listed[0]["bit_depth"], 32)

    def test_import_192khz_24bit(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="192k")
        src = self._home / "edge.wav"
        _write_hf_wav(src, sr=192_000, subtype="PCM_24")
        imported = import_recordings(created["id"], [str(src)])
        self.assertEqual(imported[0]["sample_rate_hz"], 192_000)
        self.assertEqual(imported[0]["bit_depth"], 24)

    def test_import_48khz_16bit(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Standard")
        src = self._home / "std.wav"
        _write_hf_wav(src, sr=48_000, subtype="PCM_16")
        imported = import_recordings(created["id"], [str(src)])
        self.assertEqual(imported[0]["sample_rate_hz"], 48_000)
        self.assertEqual(imported[0]["bit_depth"], 16)


if __name__ == "__main__":
    unittest.main()
