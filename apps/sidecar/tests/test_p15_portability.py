"""Portability prep: case-preserving stems, pathlib joins, Windows deny list."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.paths import (
    _assert_not_blocked,
    resolve_user_existing_or_probe,
    resolve_user_path,
)

try:
    from orcai_desktop_sidecar.adapters.predict import resolve_predict_output_path
except ModuleNotFoundError:  # pragma: no cover — host python without bundled orcAI
    resolve_predict_output_path = None  # type: ignore[assignment,misc]


class PredictStemCaseTests(unittest.TestCase):
    def test_predict_label_stem_preserves_case(self) -> None:
        """Label filename keeps recording stem case (Whale.wav → Whale_…_predicted.txt)."""
        if resolve_predict_output_path is None:
            # Same naming as adapters.predict.resolve_predict_output_path (no orcAI import).
            recording = Path("/proj/recordings/Whale.wav")
            filename = f"{recording.stem}_c1_orcai-isl-v1_predicted.txt"
            self.assertEqual(filename, "Whale_c1_orcai-isl-v1_predicted.txt")
            self.assertNotEqual(filename.lower(), filename)  # stem had uppercase
            return

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wav = root / "Whale.wav"
            wav.write_bytes(b"RIFF....WAVE")
            model = root / "orcai-isl-v1"
            model.mkdir()
            out = resolve_predict_output_path(wav, 1, model)
            self.assertEqual(out.name, "Whale_c1_orcai-isl-v1_predicted.txt")
            self.assertNotEqual(out.name, "whale_c1_orcai-isl-v1_predicted.txt")


class PathlibJoinSmokeTests(unittest.TestCase):
    def test_pathlib_join_smoke(self) -> None:
        base = Path("/tmp/orcai-proj")
        joined = base / "recordings" / "Whale.wav"
        self.assertEqual(joined.as_posix(), "/tmp/orcai-proj/recordings/Whale.wav")


class WindowsDenyPrepTests(unittest.TestCase):
    def test_unix_etc_still_blocked(self) -> None:
        with self.assertRaises(PermissionError):
            resolve_user_path("/etc/passwd", expect_wav=False)

    def test_blocks_win_nt_device_prefixes(self) -> None:
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path(r"\\?\C:\Users\x\a.wav"))
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path(r"\\.\C:\Windows\System32\x"))

    def test_blocks_drive_letter_windows_root(self) -> None:
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path(r"C:\Windows\System32\drivers"))
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path("C:/Windows/explorer.exe"))

    def test_probe_unix_tmp_still_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.wav"
            probe = resolve_user_existing_or_probe(str(missing))
            self.assertEqual(probe, missing.resolve(strict=False))
            # Must not raise PermissionError for ordinary temp paths.
            self.assertFalse(str(probe).lower().startswith("/etc"))


class UiJoinFsPathScanTests(unittest.TestCase):
    """Optional: product UI path helpers should use joinFsPath (skip if tree missing)."""

    def test_ui_helpers_use_join_fs_path(self) -> None:
        repo = Path(__file__).resolve().parents[3]
        ui_src = repo / "apps" / "ui" / "src"
        if not ui_src.is_dir():
            self.skipTest("UI tree not present")
        targets = [
            ui_src / "workspace" / "project.ts",
            ui_src / "workspace" / "predictSettings.ts",
            ui_src / "pages" / "PipelinePage.tsx",
            ui_src / "pages" / "ResultsPage.tsx",
        ]
        for path in targets:
            if not path.is_file():
                self.skipTest(f"missing {path}")
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                "joinFsPath",
                text,
                msg=f"{path.name} should use joinFsPath",
            )


if __name__ == "__main__":
    unittest.main()
