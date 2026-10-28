"""Extended unit coverage: deny lists, case stems, pathlib, UI/CSS gates."""

from __future__ import annotations

import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from orcai_desktop_sidecar.paths import (
    _assert_not_blocked,
    resolve_user_dir,
    resolve_user_existing_or_probe,
    resolve_user_output_path,
    resolve_user_path,
)

_REPO = Path(__file__).resolve().parents[3]
_UI_SRC = _REPO / "apps" / "ui" / "src"
_UI_STYLES = _UI_SRC / "styles"
_SIDECAR_PKG = Path(__file__).resolve().parents[1] / "src" / "orcai_desktop_sidecar"


class ExtendedWindowsDenyTests(unittest.TestCase):
    def test_blocks_forward_slash_nt_device_forms(self) -> None:
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path("//?/C:/Windows/System32/x"))

        # Path() on POSIX collapses "//./x" → "//x"; assert deny list on literal prefix.
        class _LiteralPath:
            def __init__(self, text: str) -> None:
                self._text = text

            def __str__(self) -> str:
                return self._text

        with self.assertRaises(PermissionError):
            _assert_not_blocked(_LiteralPath("//./C:/Windows/x"))  # type: ignore[arg-type]

    def test_blocks_winnt_drive_root(self) -> None:
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path("D:/WinNT/system32/drivers"))

    def test_blocks_systemroot_env(self) -> None:
        with mock.patch.dict(os.environ, {"SystemRoot": r"C:\Windows"}, clear=False), self.assertRaises(
            PermissionError
        ):
            _assert_not_blocked(Path(r"C:\Windows\System32\config"))

    def test_blocks_windir_env(self) -> None:
        with mock.patch.dict(os.environ, {"WINDIR": r"C:\WINDOWS"}, clear=False), self.assertRaises(
            PermissionError
        ):
            _assert_not_blocked(Path(r"C:\WINDOWS\explorer.exe"))

    def test_allows_ordinary_user_windows_style_path(self) -> None:
        # Deny list is prefix-based; user project under Users must not match Windows root.
        _assert_not_blocked(Path(r"C:\Users\lab\orcai\projects\a.wav"))


class ExtendedUnixDenyTests(unittest.TestCase):
    def test_blocks_unix_system_prefixes(self) -> None:
        for p in ("/usr/bin/python3", "/bin/sh", "/sbin/init", "/System/Library/x"):
            with self.subTest(p=p), self.assertRaises(PermissionError):
                _assert_not_blocked(Path(p))

    def test_blocks_private_etc(self) -> None:
        with self.assertRaises(PermissionError):
            _assert_not_blocked(Path("/private/etc/hosts"))

    def test_output_path_blocks_etc(self) -> None:
        with self.assertRaises(PermissionError):
            resolve_user_output_path("/etc/orcai-out.txt")

    def test_probe_blocks_etc_even_if_missing(self) -> None:
        with self.assertRaises(PermissionError):
            resolve_user_existing_or_probe("/etc/no-such-orcai-file")


class PathlibCaseAndJoinTests(unittest.TestCase):
    def test_pathlib_preserves_stem_case(self) -> None:
        p = Path("/proj/recordings") / "Whale.wav"
        self.assertEqual(p.name, "Whale.wav")
        self.assertEqual(p.stem, "Whale")
        label = f"{p.stem}_c1_orcai-isl-v1_predicted.txt"
        self.assertEqual(label, "Whale_c1_orcai-isl-v1_predicted.txt")
        self.assertNotEqual(label, "whale_c1_orcai-isl-v1_predicted.txt")

    def test_distinct_case_paths_are_different_keys(self) -> None:
        a = Path("/proj/Whale.wav")
        b = Path("/proj/whale.wav")
        self.assertNotEqual(a.name, b.name)
        self.assertEqual({a.name, b.name}, {"Whale.wav", "whale.wav"})

    def test_pathlib_join_project_layout(self) -> None:
        root = Path("/tmp/orcai-proj")
        self.assertEqual(
            (root / "recordings" / "a.wav").as_posix(),
            "/tmp/orcai-proj/recordings/a.wav",
        )
        self.assertEqual(
            (root / "models" / "orcai-isl-v1").as_posix(),
            "/tmp/orcai-proj/models/orcai-isl-v1",
        )

    def test_resolve_user_dir_allows_temp(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = resolve_user_dir(tmp)
            self.assertTrue(d.is_dir())

    def test_resolve_user_path_accepts_wav_case_suffix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "Whale.WAV"
            wav.write_bytes(b"RIFF....WAVE")
            # suffix check is .lower() == .wav — extension case OK; stem preserved.
            resolved = resolve_user_path(str(wav.resolve()), expect_wav=True)
            self.assertEqual(resolved.stem, "Whale")


class UiPortabilityScanTests(unittest.TestCase):
    def test_ui_helpers_use_join_fs_path(self) -> None:
        """Project path joins stay on joinFsPath (POSIX and Windows).

        Skip only when the UI tree is not in this checkout. A missing named
        file is a failure: the old PredictAnalysisTabPanel name must not
        silently drop the rest of the scan.
        """
        if not _UI_SRC.is_dir():
            self.skipTest("UI tree not present")
        targets = [
            "workspace/project.ts",
            "workspace/predictSettings.ts",
            "pages/PipelinePage.tsx",
            "pages/ResultsPage.tsx",
            "pages/PredictPage.tsx",
            "pages/ModelsPage.tsx",
            "components/PredictSpectrogramPanel.tsx",
            "trainWizard/plan.ts",
        ]
        slash_join = re.compile(r"""\+\s*["'][/\\]["']""")
        missing: list[str] = []
        offenders: list[str] = []
        for rel in targets:
            path = _UI_SRC / rel
            if not path.is_file():
                missing.append(rel)
                continue
            text = path.read_text(encoding="utf-8")
            if "joinFsPath" not in text:
                offenders.append(f"{rel} does not call joinFsPath")
            if slash_join.search(text):
                offenders.append(f"{rel} concatenates a slash instead of joinFsPath")
        self.assertEqual(missing, [])
        self.assertEqual(offenders, [])

    def test_ui_has_no_darwin_platform_equality(self) -> None:
        if not _UI_SRC.is_dir():
            self.skipTest("UI tree not present")
        pattern = re.compile(
            r"""platform\s*===\s*['"]darwin['"]|platform\s*===\s*['"]macos['"]"""
        )
        offenders: list[str] = []
        for path in _UI_SRC.rglob("*.ts*"):
            if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
                continue
            text = path.read_text(encoding="utf-8")
            if pattern.search(text):
                offenders.append(str(path.relative_to(_UI_SRC)))
        self.assertEqual(offenders, [])

    def test_font_stacks_have_fallbacks_without_apple_system(self) -> None:
        if not _UI_STYLES.is_dir():
            self.skipTest("UI styles not present")
        tokens = (_UI_STYLES / "tokens.css").read_text(encoding="utf-8")
        lab = (_UI_STYLES / "analysis-lab.css").read_text(encoding="utf-8")
        self.assertIn("Segoe UI", tokens)
        self.assertIn("system-ui", tokens)
        self.assertIn("Inter", tokens)
        self.assertNotIn("-apple-system", tokens)
        self.assertNotIn("-apple-system", lab)
        self.assertIn("Segoe UI", lab)

    def test_join_fs_path_helper_exists(self) -> None:
        helper = _UI_SRC / "lib" / "joinFsPath.ts"
        if not helper.is_file():
            self.skipTest("joinFsPath.ts missing")
        text = helper.read_text(encoding="utf-8")
        self.assertIn("export function joinFsPath", text)
        self.assertRegex(text, r"useWin|\\\\|\\\\")

    def test_window_chrome_api_surface(self) -> None:
        chrome = _UI_SRC / "platform" / "windowChrome.ts"
        if not chrome.is_file():
            self.skipTest("windowChrome.ts missing")
        text = chrome.read_text(encoding="utf-8")
        for name in (
            "windowClosePolicy",
            "windowSetFullscreen",
            "windowIsFullscreen",
            "uiGetScale",
            "uiSetScale",
        ):
            self.assertIn(name, text)

    def test_sidecar_engine_worker_platform_only_in_shell_layer_comment(self) -> None:
        """Metal probe may use sys.platform; UI must not. Document intentional sites."""
        worker = _SIDECAR_PKG / "engine_worker.py"
        if not worker.is_file():
            self.skipTest("engine_worker missing")
        text = worker.read_text(encoding="utf-8")
        self.assertIn("sys.platform", text)


if __name__ == "__main__":
    unittest.main()
