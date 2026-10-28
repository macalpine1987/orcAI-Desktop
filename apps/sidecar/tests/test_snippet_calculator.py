"""Train wizard snippet calculator: estimate mirrors orcAI snippet cutting."""

from __future__ import annotations

import tempfile
import unittest
import wave
from pathlib import Path

from orcai_desktop_sidecar.snippet_calculator import (
    _kept_after_removal,
    _measured_counts,
    _merge,
    _read_intervals,
    _snippet_params,
    _suggest,
    estimate_inventory,
)

SNIPPETS = {
    "segment_duration": 200,
    "snippets_per_sec": 3,
    "snippet_duration": 4,
    "fraction_removal": 0.99,
    "train": 0.8,
    "val": 0.1,
    "test": 0.1,
}


def _write_wav(path: Path, seconds: int, rate: int = 1000) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * rate * seconds)


class SnippetCalculatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _recording(self, seconds: int, labels: str, masked: set[str] | None = None):
        wav = self.root / f"rec{seconds}.wav"
        ann = self.root / f"rec{seconds}.txt"
        _write_wav(wav, seconds)
        ann.write_text(labels, encoding="utf-8")
        return {"stem": wav.stem, "wav": wav, "annotation": ann, "masked": masked or set()}

    def test_counts_follow_orcai_segments_and_filter(self) -> None:
        # 450 s → 2 segments of 200 s; per segment 480 / 60 / 60 snippets.
        rec = self._recording(
            450,
            "10\t14\tBUZZ\n210\t212\tBuzz3\n300\t301\tXYZ\n",
        )
        out = estimate_inventory(
            [rec],
            calls=["BUZZ"],
            equivalences={"BUZZ": "BUZZ", "Buzz3": "BUZZ"},
            snippets=SNIPPETS,
        )
        train = out["splits"]["train"]
        self.assertEqual(train["total"], 960)
        # Train window per segment: starts in [0, 156]; a call [s, e] is hit by
        # starts in (s - 4, e): 8 s and 6 s → 480 * 14 / 156 ≈ 43.
        self.assertEqual(train["labelled"], 43)
        # 43 labelled; 917 empty; orcAI drops int(0.99 * 917) = 907 → 53 kept.
        self.assertEqual(train["kept"], 53)
        self.assertEqual(out["splits"]["val"], {"total": 120, "labelled": 0, "kept": 2})
        self.assertEqual(out["recordings_used"], 1)

    def test_short_recording_is_skipped_like_orcai(self) -> None:
        rec = self._recording(150, "10\t14\tBUZZ\n")
        out = estimate_inventory(
            [rec], calls=["BUZZ"], equivalences={}, snippets=SNIPPETS
        )
        self.assertEqual(out["recordings_too_short"], 1)
        self.assertEqual(out["splits"]["train"]["total"], 0)

    def test_masked_class_does_not_count_as_labelled(self) -> None:
        rec = self._recording(250, "10\t14\tBUZZ\n", masked={"BUZZ"})
        out = estimate_inventory(
            [rec], calls=["BUZZ"], equivalences={}, snippets=SNIPPETS
        )
        self.assertEqual(out["splits"]["train"]["labelled"], 0)

    def test_suggest_keeps_margin_and_one_batch_floor(self) -> None:
        self.assertEqual(_suggest(3392, 64, 0.9), {"max": 53, "suggested": 47})
        self.assertEqual(_suggest(3392, 64, 1.0), {"max": 53, "suggested": 53})
        self.assertEqual(_suggest(70, 64, 0.9), {"max": 1, "suggested": 1})
        self.assertEqual(_suggest(10, 64, 0.9), {"max": 0, "suggested": 0})
        self.assertEqual(_suggest(100, 0, 0.9), {"max": 0, "suggested": 0})

    def test_removal_matches_orcai_truncation(self) -> None:
        # floor(n * 0.01) under-counts versus int(0.99 * n).
        self.assertEqual(_kept_after_removal(960, 43, 0.99), 53)
        self.assertEqual(_kept_after_removal(10, 0, 0.99), 1)
        self.assertEqual(_kept_after_removal(100, 40, 1.0), 40)
        self.assertEqual(_kept_after_removal(100, 40, 0.0), 100)

    def test_window_shorter_than_snippet_is_not_counted(self) -> None:
        # val/test own 20 s of a 200 s segment; a 30 s snippet cannot be drawn.
        rec = self._recording(250, "10\t14\tBUZZ\n")
        snippets = {**SNIPPETS, "snippet_duration": 30}
        out = estimate_inventory(
            [rec], calls=["BUZZ"], equivalences={}, snippets=snippets
        )
        self.assertGreater(out["splits"]["train"]["total"], 0)
        self.assertEqual(out["splits"]["val"]["total"], 0)
        self.assertEqual(out["splits"]["test"]["total"], 0)

    def test_intervals_skip_short_lines_and_merge_overlaps(self) -> None:
        path = self.root / "ann.txt"
        path.write_text("nope\n1.5\t4\tBUZZ\n3\t6\tBUZZ\n\n", encoding="utf-8")
        self.assertEqual(_read_intervals(path), [(1.5, 4.0, "BUZZ"), (3.0, 6.0, "BUZZ")])
        self.assertEqual(_merge([(1.5, 4.0), (3.0, 6.0), (8.0, 9.0)]), [(1.5, 6.0), (8.0, 9.0)])

    def test_snippet_params_reject_non_finite(self) -> None:
        params = _snippet_params({"segment_duration": "nan", "train": -1, "fraction_removal": 2})
        self.assertEqual(params["segment_duration"], 200)
        self.assertEqual(params["train"], 0)
        self.assertEqual(params["fraction_removal"], 1)

    def test_measured_uses_orcai_name_parameter_not_alphabetical(self) -> None:
        import gzip
        import json

        proj = self.root / "Zed"
        (proj / "tvt_data").mkdir(parents=True)
        (proj / "aaa_orcai_parameter.json").write_text(
            json.dumps({"snippets": {**SNIPPETS, "segment_duration": 1}}),
            encoding="utf-8",
        )
        (proj / "Zed_orcai_parameter.json").write_text(
            json.dumps({"snippets": SNIPPETS}),
            encoding="utf-8",
        )
        with gzip.open(proj / "tvt_data" / "all_snippets.csv.gz", "wt", encoding="utf-8") as handle:
            handle.write("recording,data_type,OTHER\n")
        out = _measured_counts(
            proj,
            calls=["BUZZ"],
            snippets=SNIPPETS,
            seed=1,
            project={"path": str(proj), "orcai_name": "Zed"},
        )
        assert out is not None
        # Zed's parameters match, but the table has no BUZZ column → not measured.
        self.assertTrue(out["matches_params"])
        self.assertIsNone(out["splits"])

    def test_measured_without_snippets_block_is_not_a_match(self) -> None:
        import gzip
        import json

        proj = self.root / "Bare"
        (proj / "tvt_data").mkdir(parents=True)
        (proj / "Bare_orcai_parameter.json").write_text(json.dumps({}), encoding="utf-8")
        with gzip.open(proj / "tvt_data" / "all_snippets.csv.gz", "wt", encoding="utf-8") as handle:
            handle.write("recording,data_type,BUZZ\n")
        out = _measured_counts(
            proj,
            calls=["BUZZ"],
            snippets=SNIPPETS,
            seed=0,
            project={"path": str(proj), "orcai_name": "Bare"},
        )
        assert out is not None
        self.assertFalse(out["matches_params"])
        self.assertIsNone(out["splits"])


if __name__ == "__main__":
    unittest.main()
