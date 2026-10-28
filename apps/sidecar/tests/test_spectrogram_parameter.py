"""Tests for spectrogram parameter fallback."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.adapters.spectrogram import (
    _default_orcai_parameter,
    _parameter_cache_key,
    _read_orcai_parameter,
)


class SpectrogramParameterTests(unittest.TestCase):
    def test_missing_parameter_file_uses_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing_orcai_parameter.json"
            default = _default_orcai_parameter()
            loaded = _read_orcai_parameter(missing)
            self.assertEqual(loaded["name"], default["name"])

    def test_parameter_cache_key_none_for_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            self.assertIsNone(_parameter_cache_key(missing))

    def test_parameter_cache_key_for_existing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            param = Path(tmp) / "param.json"
            param.write_text('{"name": "test-param"}', encoding="utf-8")
            key = _parameter_cache_key(param)
            self.assertEqual(key, str(param.resolve()))


if __name__ == "__main__":
    unittest.main()
