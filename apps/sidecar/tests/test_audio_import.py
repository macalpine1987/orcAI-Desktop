"""WAV import and audio path helpers."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from orcai_desktop_sidecar.adapters.audio_import import run_import_audio
from orcai_desktop_sidecar.wav_io import audio_import_kind


def _patch_run_import_globals(**replacements: object):
    """Patch names in the module dict bound to ``run_import_audio``.

    Discover can bind an older ``audio_import`` module object than
    ``sys.modules[...]``; patching by dotted path then misses the live globals.
    """
    return patch.dict(run_import_audio.__globals__, replacements, clear=False)


class TestAudioImportKind(unittest.TestCase):
    def test_detects_wav_only(self) -> None:
        self.assertEqual(audio_import_kind("/a.wav"), "wav")
        self.assertEqual(audio_import_kind("/a.WAV"), "wav")
        self.assertIsNone(audio_import_kind("/a.flac"))
        self.assertIsNone(audio_import_kind("/a.mp3"))


class TestImportAudioJob(unittest.TestCase):
    def test_partial_failure_returns_failed_rows(self) -> None:
        def mock_import(_pid: str, src, **kwargs):
            p = Path(str(src))
            if p.name == "b.wav":
                raise ValueError("bad file")
            return {
                "source": str(p),
                "dest": f"/proj/recordings/{p.stem}.wav",
                "name": f"{p.stem}.wav",
                "kind": "wav",
            }

        with _patch_run_import_globals(import_audio_path=mock_import):
            result = run_import_audio(
                "job-test",
                {
                    "project_id": "p1",
                    "paths": ["/a.wav", "/b.wav"],
                },
            )
        self.assertEqual(result["count"], 1)
        self.assertEqual(len(result["imported"]), 1)
        self.assertEqual(len(result["failed"]), 1)
        self.assertIn("bad file", result["failed"][0]["error"])

    def test_logs_progress_per_file(self) -> None:
        lines: list[str] = []

        def mock_import(_pid: str, src, **kwargs):
            p = Path(str(src))
            return {
                "source": str(p),
                "dest": f"/proj/recordings/{p.name}",
                "name": p.name,
                "kind": "wav",
            }

        progress = MagicMock()
        with _patch_run_import_globals(
            import_audio_path=mock_import,
            set_progress=progress,
        ):
            result = run_import_audio(
                "job-test",
                {
                    "project_id": "p1",
                    "paths": ["/z.wav", "/a.wav"],
                },
                log=lines.append,
            )
        self.assertEqual(result["count"], 2)
        self.assertTrue(any("[1/2] a.wav" in line for line in lines))
        self.assertTrue(any("[2/2] z.wav" in line for line in lines))
        self.assertTrue(progress.called)
        self.assertEqual(progress.call_args_list[-1].args[1], 1.0)


if __name__ == "__main__":
    unittest.main()
