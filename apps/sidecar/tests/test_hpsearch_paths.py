"""hpsearch adapter must pass Path for data_dir (orcAI calls .joinpath)."""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path
from unittest import mock

# Prefer workspace sidecar over a stamped .app site-packages.
_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))
# Drop a previously imported stamped package so we load workspace sources.
for _name in list(sys.modules):
    if _name == "orcai_desktop_sidecar" or _name.startswith("orcai_desktop_sidecar."):
        del sys.modules[_name]


class TestHpsearchPathCoercion(unittest.TestCase):
    def test_run_hpsearch_coerces_str_dirs_to_path(self) -> None:
        from orcai_desktop_sidecar.adapters import training as training_mod

        importlib.reload(training_mod)
        run_hpsearch = training_mod.run_hpsearch

        captured: dict = {}

        def fake_hpsearch(
            data_dir,
            output_dir,
            orcai_parameter=None,
            hps_parameter=None,
            parallel=False,
            compression_type="GZIP",
            verbosity=2,
            msgr=None,
        ):
            captured["data_dir"] = data_dir
            captured["output_dir"] = output_dir

        data = "/tmp/orcai-hpsearch-test/tvt_data"
        out = "/tmp/orcai-hpsearch-test/hpsearch"
        with mock.patch(
            "orcai.hpsearch.hyperparameter_search",
            new=fake_hpsearch,
        ):
            run_hpsearch(
                "job-hps",
                {
                    "data_dir": data,
                    "output_dir": out,
                    "orcai_parameter": "/tmp/orcai-hpsearch-test/orcai_parameter.json",
                    "hps_parameter": "/tmp/orcai-hpsearch-test/hps_parameter.json",
                    "verbosity": 0,
                },
            )

        self.assertIsInstance(captured["data_dir"], Path)
        self.assertIsInstance(captured["output_dir"], Path)
        self.assertTrue(hasattr(captured["data_dir"], "joinpath"))
        self.assertEqual(str(captured["data_dir"]), str(Path(data).resolve()))
        self.assertEqual(str(captured["output_dir"]), str(Path(out).resolve()))


if __name__ == "__main__":
    unittest.main()
