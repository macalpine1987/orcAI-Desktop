"""resolve_trained_model_dir accepts nested models/<name>/<name>/ layout."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.model_paths import resolve_trained_model_dir


class ResolveTrainedModelDirTests(unittest.TestCase):
    def test_direct_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "models" / "demo"
            root.mkdir(parents=True)
            (root / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            self.assertEqual(resolve_trained_model_dir(root), root.resolve())

    def test_nested_double_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            outer = Path(tmp) / "models" / "new2"
            inner = outer / "new2"
            inner.mkdir(parents=True)
            (inner / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            self.assertEqual(resolve_trained_model_dir(outer), inner.resolve())


if __name__ == "__main__":
    unittest.main()
