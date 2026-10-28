"""-ct for test / train / hpsearch follows the TFRecord header on disk.

The Models «Тест» button does not send compression_type. A dataset written
with compression_type=None is plain TFRecord; forcing GZIP makes TensorFlow
fail with ``incorrect header check``. These tests lock that contract.
"""

from __future__ import annotations

import shlex
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar import jobs as jobs_mod
from orcai_desktop_sidecar.cli_command import build_command_line
from orcai_desktop_sidecar.jobs import create_job, get_job
from orcai_desktop_sidecar.tvt_compression import (
    align_dataset_compression,
    detect_tvt_compression,
    sniff_tfrecord_compression,
)

_GZIP = b"\x1f\x8b\x08\x00rest"
_PLAIN = b"\x4d\xb2\x07\x00rest"


def _write(folder: Path, name: str, payload: bytes) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(payload)
    return path


def _shard(root: Path, payload: bytes, *, split: str = "test_dataset", name: str = "data_00000.tfrecord") -> Path:
    return _write(root / split, name, payload)


class SniffTests(unittest.TestCase):
    def test_gzip_magic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = _write(Path(tmp), "data_00000.tfrecord", _GZIP)
            self.assertEqual(sniff_tfrecord_compression(path), "GZIP")

    def test_plain_header_is_none_token(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = _write(Path(tmp), "data_00000.tfrecord", _PLAIN)
            self.assertEqual(sniff_tfrecord_compression(path), "None")

    def test_short_and_missing_files_are_unknown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            empty = _write(root, "empty.tfrecord", b"")
            short = _write(root, "short.tfrecord", b"\x1f")
            self.assertIsNone(sniff_tfrecord_compression(empty))
            self.assertIsNone(sniff_tfrecord_compression(short))
            self.assertIsNone(sniff_tfrecord_compression(root / "missing.tfrecord"))

    def test_directory_named_like_a_shard_is_unknown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data_00000.tfrecord"
            path.mkdir()
            self.assertIsNone(sniff_tfrecord_compression(path))


class DetectTests(unittest.TestCase):
    def test_reads_split_folders_in_order(self) -> None:
        """test_dataset wins over a later gzip train_dataset."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _PLAIN, split="test_dataset")
            _shard(root, _GZIP, split="train_dataset")
            self.assertEqual(detect_tvt_compression(root), "None")

    def test_skips_empty_shard_and_uses_the_next(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, b"", name="data_00000.tfrecord")
            _shard(root, _GZIP, name="data_00001.tfrecord")
            self.assertEqual(detect_tvt_compression(root), "GZIP")

    def test_skips_directory_shard_and_uses_the_next_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "test_dataset").mkdir()
            (root / "test_dataset" / "data_00000.tfrecord").mkdir()
            _shard(root, _PLAIN, name="data_00001.tfrecord")
            self.assertEqual(detect_tvt_compression(root), "None")

    def test_root_shard_is_only_a_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "test_dataset").mkdir()
            _write(root, "data_00000.tfrecord", _GZIP)
            self.assertEqual(detect_tvt_compression(root), "GZIP")

    def test_split_folder_hides_a_different_root_shard(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _PLAIN)
            _write(root, "data_00000.tfrecord", _GZIP)
            self.assertEqual(detect_tvt_compression(root), "None")

    def test_ignores_shards_outside_known_folders(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root / "export", "data_00000.tfrecord", _GZIP)
            _write(root / "test_dataset", "notes.txt", b"not a shard")
            self.assertIsNone(detect_tvt_compression(root))

    def test_unknown_when_dir_missing_or_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            note = root / "not-a-dir.txt"
            note.write_text("x", encoding="utf-8")
            self.assertIsNone(detect_tvt_compression(root))
            self.assertIsNone(detect_tvt_compression(root / "missing"))
            self.assertIsNone(detect_tvt_compression(note))


class AlignTests(unittest.TestCase):
    def test_disk_overrides_every_caller_value(self) -> None:
        cases = (
            ("plain", _PLAIN, "GZIP", None),
            ("plain", _PLAIN, None, None),
            ("plain", _PLAIN, "None", None),
            ("gzip", _GZIP, None, "GZIP"),
            ("gzip", _GZIP, "None", "GZIP"),
            ("gzip", _GZIP, "GZIP", "GZIP"),
        )
        for label, payload, caller, expected in cases:
            with self.subTest(label=label, caller=caller), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                _shard(root, payload)
                original = {
                    "data_dir": str(root),
                    "compression_type": caller,
                    "model_dir": "/m",
                }
                aligned = align_dataset_compression(original)
                self.assertEqual(aligned["compression_type"], expected)
                self.assertEqual(aligned["model_dir"], "/m")
                self.assertEqual(original["compression_type"], caller)
                self.assertIsNot(aligned, original)

    def test_omitted_key_is_filled_from_disk(self) -> None:
        """Models «Тест» sends no compression_type."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _PLAIN)
            aligned = align_dataset_compression({"data_dir": str(root)})
            self.assertIn("compression_type", aligned)
            self.assertIsNone(aligned["compression_type"])

    def test_missing_shards_keep_the_caller_value(self) -> None:
        original = {"data_dir": "/no/such/tvt", "compression_type": "GZIP"}
        aligned = align_dataset_compression(original)
        self.assertEqual(aligned["compression_type"], "GZIP")
        self.assertEqual(original["compression_type"], "GZIP")

    def test_blank_or_non_string_data_dir_is_left_alone(self) -> None:
        self.assertEqual(
            align_dataset_compression({"data_dir": "  ", "compression_type": "GZIP"})[
                "compression_type"
            ],
            "GZIP",
        )
        self.assertEqual(
            align_dataset_compression({"data_dir": None, "compression_type": None})[
                "compression_type"
            ],
            None,
        )
        self.assertNotIn(
            "compression_type",
            align_dataset_compression({"model_dir": "/m"}),
        )


class CreateJobCompressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._patch = patch(
            "orcai_desktop_sidecar.store._APP_DIR", Path(self._tmp.name)
        )
        self._patch.start()
        jobs_mod._bootstrapped = False
        jobs_mod._jobs.clear()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        jobs_mod._bootstrapped = False
        jobs_mod._jobs.clear()

    def _reload(self, job_id: str):
        jobs_mod._jobs.clear()
        jobs_mod._bootstrapped = False
        loaded = get_job(job_id)
        self.assertIsNotNone(loaded)
        return loaded

    def test_reader_commands_follow_plain_shards(self) -> None:
        for command in ("test", "train", "hpsearch"):
            with self.subTest(command=command), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                _shard(root, _PLAIN)
                caller = {
                    "project_dir": str(root),
                    "model_dir": str(root / "model"),
                    "data_dir": str(root),
                    "output_dir": str(root / "out"),
                    "compression_type": "GZIP",
                    "test_unfiltered": True,
                }
                job = create_job(command, caller)
                self.assertEqual(caller["compression_type"], "GZIP")
                self.assertIn("compression_type", job.params)
                self.assertIsNone(job.params["compression_type"])
                parts = shlex.split(job.command_line or "")
                self.assertNotIn("-ct", parts)
                if command == "test":
                    self.assertIn("-tu", parts)
                stored = self._reload(job.id)
                self.assertIn("compression_type", stored.params)
                self.assertIsNone(stored.params["compression_type"])
                self.assertNotIn("-ct", shlex.split(stored.command_line or ""))

    def test_models_payload_without_compression_still_records_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _PLAIN)
            job = create_job(
                "test",
                {
                    "project_dir": str(root),
                    "model_dir": str(root / "model"),
                    "data_dir": str(root),
                    "orcai_parameter": str(root / "orcai_parameter.json"),
                    "test_unfiltered": True,
                },
            )
            self.assertIn("compression_type", job.params)
            self.assertIsNone(job.params["compression_type"])
            self.assertNotIn("-ct", shlex.split(job.command_line or ""))
            self.assertIn("-tu", shlex.split(job.command_line or ""))

    def test_gzip_shards_keep_an_explicit_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _GZIP)
            job = create_job(
                "test",
                {
                    "model_dir": str(root / "model"),
                    "data_dir": str(root),
                    "test_unfiltered": True,
                },
            )
            self.assertEqual(job.params["compression_type"], "GZIP")
            parts = shlex.split(job.command_line or "")
            self.assertEqual(parts[parts.index("-ct") + 1], "GZIP")

    def test_string_none_does_not_hide_gzip_shards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _GZIP)
            job = create_job(
                "train",
                {
                    "data_dir": str(root),
                    "output_dir": str(root / "models"),
                    "compression_type": "None",
                },
            )
            self.assertEqual(job.params["compression_type"], "GZIP")
            parts = shlex.split(job.command_line or "")
            self.assertEqual(parts[parts.index("-ct") + 1], "GZIP")

    def test_create_tvt_data_keeps_the_requested_compression(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _shard(root, _PLAIN)
            job = create_job(
                "create-tvt-data",
                {
                    "tvt_dir": str(root),
                    "data_dir": str(root),
                    "compression_type": "GZIP",
                },
            )
            self.assertEqual(job.params["compression_type"], "GZIP")
            parts = shlex.split(job.command_line or "")
            self.assertEqual(parts[parts.index("-ct") + 1], "GZIP")


class EngineCallTests(unittest.TestCase):
    def test_run_test_passes_none_and_cli_omits_ct(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_test

        seen: dict[str, object] = {}

        def fake_test_model(
            model_dir: object,
            data_dir: object,
            test_unfiltered: bool = True,
            output_dir: object = None,
            compression_type: object = "GZIP",
            verbosity: int = 2,
            msgr: object = None,
        ) -> None:
            seen["compression_type"] = compression_type
            seen["test_unfiltered"] = test_unfiltered
            seen["model_dir"] = model_dir
            seen["data_dir"] = data_dir

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = root / "model"
            model.mkdir()
            (model / "weights.keras").write_bytes(b"x")
            _shard(root, _PLAIN)
            _write(root / "test_unfiltered_dataset", "dataset_shapes.json", b"{}")
            with patch("orcai.test_models.test_model", new=fake_test_model):
                result = run_test(
                    "job-plain",
                    {
                        "model_dir": str(model),
                        "data_dir": str(root),
                        "compression_type": "GZIP",
                        "test_unfiltered": True,
                    },
                )
        self.assertIsNone(seen["compression_type"])
        self.assertIs(seen["test_unfiltered"], True)
        self.assertIn("compression_type", result["cli_params"])
        self.assertIsNone(result["cli_params"]["compression_type"])
        parts = shlex.split(build_command_line("test", result["cli_params"]))
        self.assertNotIn("-ct", parts)
        self.assertIn("-tu", parts)

    def test_run_test_passes_gzip_when_shards_are_gzip(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_test

        seen: dict[str, object] = {}

        def fake_test_model(
            model_dir: object,
            data_dir: object,
            test_unfiltered: bool = True,
            output_dir: object = None,
            compression_type: object = "GZIP",
            verbosity: int = 2,
            msgr: object = None,
        ) -> None:
            seen["compression_type"] = compression_type

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = root / "model"
            model.mkdir()
            _shard(root, _GZIP)
            with patch("orcai.test_models.test_model", new=fake_test_model):
                result = run_test(
                    "job-gzip",
                    {"model_dir": str(model), "data_dir": str(root)},
                )
        self.assertEqual(seen["compression_type"], "GZIP")
        parts = shlex.split(build_command_line("test", result["cli_params"]))
        self.assertEqual(parts[parts.index("-ct") + 1], "GZIP")

    def test_run_hpsearch_and_train_follow_plain_shards(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_hpsearch, run_train

        seen: dict[str, object] = {}

        def fake_engine(
            data_dir: object,
            output_dir: object,
            compression_type: object = "GZIP",
            verbosity: int = 2,
            msgr: object = None,
            orcai_parameter: object = None,
        ) -> None:
            seen["compression_type"] = compression_type
            seen["data_dir"] = data_dir
            del output_dir, verbosity, msgr, orcai_parameter

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "out"
            out.mkdir()
            _shard(root, _PLAIN)
            with patch("orcai.hpsearch.hyperparameter_search", new=fake_engine):
                hp = run_hpsearch(
                    "job-hp",
                    {
                        "data_dir": str(root),
                        "output_dir": str(out),
                        "compression_type": "GZIP",
                    },
                )
            self.assertIsNone(seen["compression_type"])
            self.assertIsNone(hp["cli_params"]["compression_type"])
            seen.clear()
            with (
                patch("orcai.train.train", new=fake_engine),
                patch(
                    "orcai_desktop_sidecar.train_live.install_train_fit_hook",
                    return_value=lambda: None,
                ),
            ):
                trained = run_train(
                    "job-train",
                    {
                        "data_dir": str(root),
                        "output_dir": str(out),
                        "compression_type": "GZIP",
                    },
                )
            self.assertIsNone(seen["compression_type"])
            self.assertIsNone(trained["cli_params"]["compression_type"])
            parts = shlex.split(build_command_line("train", trained["cli_params"]))
            self.assertNotIn("-ct", parts)
