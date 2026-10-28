"""Tests for path validation."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.paths import resolve_user_path


class ResolveUserPathTests(unittest.TestCase):
    def test_rejects_relative_path(self) -> None:
        with self.assertRaises(ValueError):
            resolve_user_path("relative.wav", expect_wav=True)

    def test_rejects_non_wav(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            txt = Path(tmp) / "a.txt"
            txt.write_text("x", encoding="utf-8")
            with self.assertRaises(ValueError):
                resolve_user_path(str(txt.resolve()), expect_wav=True)

    def test_accepts_absolute_wav(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "test.wav"
            wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVE")
            resolved = resolve_user_path(str(wav.resolve()), expect_wav=True)
            self.assertTrue(resolved.is_file())

    def test_blocks_etc_passwd(self) -> None:
        with self.assertRaises(PermissionError):
            resolve_user_path("/etc/passwd", expect_wav=False)


if __name__ == "__main__":
    unittest.main()
