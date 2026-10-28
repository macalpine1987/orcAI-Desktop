"""Built-in model discovery tests."""

from __future__ import annotations

import importlib.util
import unittest


def _orcai_installed() -> bool:
    return importlib.util.find_spec("orcai") is not None


@unittest.skipUnless(_orcai_installed(), "orcai not installed")
class BuiltinModelsTests(unittest.TestCase):
    def test_list_builtin_models_non_empty(self) -> None:
        from orcai_desktop_sidecar.adapters.models import list_builtin_models

        models = list_builtin_models()
        self.assertGreater(len(models), 0)
        for m in models:
            self.assertEqual(m["kind"], "builtin")
            self.assertTrue(m["id"].startswith("orcai-"))

    def test_verify_builtin_models_bundle(self) -> None:
        from orcai_desktop_sidecar.adapters.models import verify_builtin_models_bundle

        verify_builtin_models_bundle()

    def test_builtin_models_include_calls(self) -> None:
        from orcai_desktop_sidecar.adapters.models import list_builtin_models

        models = list_builtin_models()
        self.assertTrue(any(m.get("calls") for m in models))
        for m in models:
            self.assertIsInstance(m.get("calls"), list)

    def test_trained_models_expose_calls_from_parameter(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        from orcai_desktop_sidecar.adapters.models import list_trained_models

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_dir = root / "models" / "demo"
            model_dir.mkdir(parents=True)
            (model_dir / "orcai_parameter.json").write_text(
                json.dumps({"name": "demo", "calls": ["SS", "WHISTLE"]}),
                encoding="utf-8",
            )
            (model_dir / "demo.keras").write_bytes(b"fake")
            models = list_trained_models(root)
            self.assertEqual(len(models), 1)
            self.assertEqual(models[0]["kind"], "trained")
            self.assertEqual(models[0]["calls"], ["SS", "WHISTLE"])

    def test_models_list_endpoint_accepts_calls_lists(self) -> None:
        """Regression: FastAPI return type must not be dict[str, str] (calls is a list)."""
        from pathlib import Path

        main_src = (
            Path(__file__).resolve().parents[1]
            / "src"
            / "orcai_desktop_sidecar"
            / "main.py"
        ).read_text(encoding="utf-8")
        self.assertIn("def models_list", main_src)
        # Must not force every model field to str (breaks ``calls: list[str]``).
        self.assertNotIn(
            "-> dict[str, list[dict[str, str]]]",
            main_src,
        )
        self.assertIn("-> dict[str, Any]", main_src)
