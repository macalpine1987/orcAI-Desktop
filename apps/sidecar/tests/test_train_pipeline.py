"""FR-7.2: pipeline step state follows the project directory, not UI flags."""

from __future__ import annotations

import gzip
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.train_pipeline import (
    TRAIN_STEP_IDS,
    disk_readiness_state,
    estimate_pipeline_disk_needed,
    inspect_pipeline,
)


def _write(path: Path, text: str = "x") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _gzip_csv(path: Path, rows: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write("recording,data_type\n")
        for i in range(rows):
            handle.write(f"rec{i},train\n")


def _param(path: Path, **model_extra: object) -> None:
    model = {
        "epochs": 30,
        "batch_size": 64,
        "n_batch_train": 2,
        "n_batch_val": 1,
        "n_batch_test": 1,
        "filters": [30, 40],
    }
    model.update(model_extra)
    data = {
        "name": "demo",
        "architecture": "ResNetLSTM",
        "model": model,
        "spectrogram": {
            "sampling_rate": 48000,
            "nfft": 512,
            "n_overlap": 256,
            "freq_range": [0, 16000],
            "duration": 4,
        },
        "calls": ["BR", "WHISTLE"],
        "snippets": {
            "segment_duration": 200,
            "snippets_per_sec": 3,
            "snippet_duration": 4,
            "train": 0.8,
            "val": 0.1,
            "test": 0.1,
        },
        "seed": 0,
    }
    path.write_text(json.dumps(data, indent=4), encoding="utf-8")


class TrainPipelineInspectTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "Fjord"
        self.root.mkdir()
        (self.root / "recordings").mkdir()
        (self.root / "annotations").mkdir()
        _param(self.root / "fjord_orcai_parameter.json")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _inspect(self, jobs: list | None = None):
        return inspect_pipeline(
            self.root,
            orcai_name="fjord",
            jobs=jobs or [],
            accelerator={"gpu_available": True, "gpu_backend": "metal"},
        )

    def _step(self, payload: dict, step_id: str) -> dict:
        return next(s for s in payload["steps"] if s["id"] == step_id)

    def test_eight_steps_in_orcai_order(self) -> None:
        payload = self._inspect()
        ids = [s["id"] for s in payload["steps"]]
        self.assertEqual(tuple(ids), TRAIN_STEP_IDS)
        self.assertEqual(len(ids), 8)
        self.assertTrue(self._step(payload, "hpsearch")["optional"])
        self.assertFalse(self._step(payload, "train")["optional"])

    def test_accelerator_lamp_blue_only_for_gpu_session(self) -> None:
        cpu = inspect_pipeline(
            self.root,
            orcai_name="fjord",
            jobs=[],
            accelerator={
                "gpu_available": False,
                "active_compute_device": "cpu",
                "accelerator_hint": "CPU",
            },
        )
        self.assertEqual(cpu["readiness"]["accelerator"]["state"], "ok")
        gpu = inspect_pipeline(
            self.root,
            orcai_name="fjord",
            jobs=[],
            accelerator={
                "gpu_available": True,
                "active_compute_device": "gpu",
                "gpu_backend": "metal",
            },
        )
        self.assertEqual(gpu["readiness"]["accelerator"]["state"], "info")
        # Probe Metal without an active GPU session → green (not blue).
        probe_only = inspect_pipeline(
            self.root,
            orcai_name="fjord",
            jobs=[],
            accelerator={
                "gpu_available": True,
                "active_compute_device": "",
                "gpu_backend": "metal",
            },
        )
        self.assertEqual(probe_only["readiness"]["accelerator"]["state"], "ok")
        self.assertEqual(
            probe_only["readiness"]["accelerator"]["active_compute_device"], "cpu"
        )

    def test_empty_project_spectrograms_blocked_test_needs_checkpoint(self) -> None:
        payload = self._inspect()
        self.assertEqual(self._step(payload, "create-spectrograms")["status"], "blocked")
        self.assertEqual(self._step(payload, "create-spectrograms")["reason"], "missing_recording_table")
        self.assertFalse(self._step(payload, "create-spectrograms")["can_run"])
        self.assertEqual(self._step(payload, "test")["status"], "blocked")
        self.assertEqual(self._step(payload, "test")["reason"], "missing_checkpoint")
        self.assertEqual(self._step(payload, "hpsearch")["status"], "blocked")
        self.assertEqual(self._step(payload, "train")["status"], "blocked")

    def test_done_then_delete_artifact_becomes_idle(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        spec = self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json"
        _write(spec, '{"min":0,"max":10,"length":100}')
        payload = self._inspect()
        self.assertEqual(self._step(payload, "create-spectrograms")["status"], "done")
        self.assertTrue(self._step(payload, "create-spectrograms")["can_run"])

        import shutil

        shutil.rmtree(self.root / "spectrograms")
        after = self._inspect()
        self.assertEqual(self._step(after, "create-spectrograms")["status"], "idle")

    def test_base_dir_alone_is_not_an_annotation(self) -> None:
        """Folder path on every CSV row must not light the annotations lamp green."""
        _write(self.root / "recordings" / "rec1.wav", "")
        _write(self.root / "recordings" / "rec2.wav", "")
        table = self.root / "recording_table.csv"
        table.write_text(
            "recording,base_dir_annotation,rel_annotation_path\n"
            f"rec1,{self.root / 'annotations'},\n"
            f"rec2,{self.root / 'annotations'},\n",
            encoding="utf-8",
        )
        payload = self._inspect()
        ann = payload["readiness"]["annotations"]
        self.assertEqual(ann["state"], "warn")
        self.assertEqual(ann["annotated"], 0)
        self.assertEqual(ann["total"], 2)
        self.assertEqual(ann["paired"], 0)
        self.assertEqual(ann["wav_count"], 2)
        specs = self._step(payload, "create-spectrograms")
        self.assertNotEqual(specs["reason"], "no_annotations")
        self.assertTrue(specs["can_run"])
        for step_id in (
            "create-label-arrays",
            "create-snippet-table",
            "train",
            "test",
        ):
            held = self._step(payload, step_id)
            self.assertEqual(held["status"], "blocked")
            self.assertEqual(held["reason"], "no_annotations")
            self.assertFalse(held["can_run"])
        skipped = payload["readiness"]["unlabeled"]
        self.assertEqual(skipped["state"], "warn")
        self.assertEqual(skipped["count"], 2)

        _write(self.root / "annotations" / "rec1.txt", "0.0\t1.0\tBR\n")
        partial_payload = self._inspect()
        partial = partial_payload["readiness"]
        self.assertNotEqual(
            self._step(partial_payload, "create-label-arrays")["reason"],
            "no_annotations",
        )
        self.assertEqual(partial["annotations"]["state"], "ok")
        self.assertEqual(partial["annotations"]["annotated"], 1)
        self.assertEqual(partial["annotations"]["total"], 2)
        self.assertEqual(partial["unlabeled"]["state"], "warn")
        self.assertEqual(partial["unlabeled"]["count"], 1)
        # A table path without a .txt must not hide the missing WAV.
        table.write_text(
            "recording,base_dir_annotation,rel_annotation_path\n"
            f"rec1,{self.root / 'annotations'},rec1.txt\n"
            f"rec2,{self.root / 'annotations'},rec2.txt\n",
            encoding="utf-8",
        )
        after_phantom = self._inspect()["readiness"]
        still_missing = after_phantom["unlabeled"]
        self.assertEqual(still_missing["state"], "warn")
        self.assertEqual(still_missing["count"], 1)
        # The path in the table is not a second label file.
        self.assertEqual(after_phantom["annotations"]["annotated"], 1)
        self.assertEqual(after_phantom["annotations"]["state"], "ok")
        self.assertEqual(after_phantom["annotations"]["paired"], 1)

        _write(self.root / "annotations" / "rec2.txt", "0.0\t1.0\tBR\n")
        full = self._inspect()["readiness"]["unlabeled"]
        self.assertEqual(full["state"], "ok")
        self.assertEqual(full["count"], 0)

    def test_predicted_export_and_nested_label(self) -> None:
        """Exports are not labels. A nested manual .txt with the WAV stem is."""
        from orcai_desktop_sidecar.train_pipeline import lacks_paired_annotation_txt

        _write(self.root / "recordings" / "rec1.wav", "")
        _write(self.root / "annotations" / "rec1_Predicted.txt", "0.0\t1.0\tBR\n")
        table = self.root / "recording_table.csv"
        table.write_text("recording\nrec1\n", encoding="utf-8")
        payload = self._inspect()
        ann = payload["readiness"]["annotations"]
        self.assertEqual(ann["annotated"], 0)
        self.assertEqual(ann["state"], "warn")
        self.assertTrue(lacks_paired_annotation_txt(self.root))
        self.assertEqual(self._step(payload, "create-label-arrays")["reason"], "no_annotations")
        self.assertTrue(self._step(payload, "create-spectrograms")["can_run"])

        _write(self.root / "annotations" / "batch" / "rec1.txt", "0.0\t1.0\tBR\n")
        opened = self._inspect()["readiness"]["annotations"]
        self.assertEqual(opened["annotated"], 1)
        self.assertEqual(opened["state"], "ok")
        self.assertFalse(lacks_paired_annotation_txt(self.root))

    def test_spectrograms_without_labels_are_not_done(self) -> None:
        """D-08: spectrogram files must not count as create-label-arrays artifacts."""
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        spec = self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json"
        _write(spec, '{"min":0,"max":10,"length":100}')
        payload = self._inspect()
        self.assertEqual(self._step(payload, "create-spectrograms")["status"], "done")
        labels = self._step(payload, "create-label-arrays")
        self.assertEqual(labels["status"], "blocked")
        self.assertEqual(labels["reason"], "no_annotations")
        self.assertFalse(labels["can_run"])
        snippet = self._step(payload, "create-snippet-table")
        self.assertEqual(snippet["status"], "blocked")
        self.assertEqual(snippet["reason"], "missing_label_arrays")
        self.assertFalse(snippet["can_run"])

        _write(self.root / "annotations" / "rec1.txt", "0.0\t1.0\tBR\n")
        with_ann = self._inspect()
        idle_labels = self._step(with_ann, "create-label-arrays")
        self.assertEqual(idle_labels["status"], "idle")
        self.assertTrue(idle_labels["can_run"])
        self.assertEqual(self._step(with_ann, "create-snippet-table")["status"], "blocked")
        self.assertEqual(self._step(with_ann, "create-snippet-table")["reason"], "missing_label_arrays")

        _write(self.root / "label_arrays" / "rec1" / "labels" / "mask.npy", "x")
        done = self._inspect()
        self.assertEqual(self._step(done, "create-label-arrays")["status"], "done")
        self.assertEqual(self._step(done, "create-snippet-table")["status"], "idle")
        self.assertTrue(self._step(done, "create-snippet-table")["can_run"])

    def test_labels_next_to_spectrograms_still_count(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        _write(self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json", "{}")
        _write(self.root / "spectrograms" / "rec1" / "labels" / "mask.npy", "x")
        payload = self._inspect()
        self.assertEqual(self._step(payload, "create-spectrograms")["status"], "done")
        self.assertEqual(self._step(payload, "create-label-arrays")["status"], "done")

    def test_stale_after_parameter_change(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        spec = self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json"
        _write(spec, '{"min":0,"max":10,"length":100}')
        past = time.time() - 120
        import os

        os.utime(table, (past, past))
        os.utime(spec, (past, past))
        os.utime(spec.parent, (past, past))
        # Baseline fingerprint from first inspect (done).
        first = self._inspect()
        self.assertEqual(self._step(first, "create-spectrograms")["status"], "done")
        param = self.root / "fjord_orcai_parameter.json"
        data = json.loads(param.read_text(encoding="utf-8"))
        data["spectrogram"]["nfft"] = 1024
        param.write_text(json.dumps(data, indent=4), encoding="utf-8")
        payload = self._inspect()
        self.assertEqual(self._step(payload, "create-spectrograms")["status"], "stale")
        self.assertEqual(self._step(payload, "create-spectrograms")["reason"], "params_changed_spectrogram")

    def test_n_batch_clamp_does_not_stale_spectrograms(self) -> None:
        """Rewriting only model.n_batch_* must not mark spectrogram/snippet steps stale."""
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        spec = self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json"
        _write(spec, '{"min":0,"max":10,"length":100}')
        past = time.time() - 120
        import os

        os.utime(table, (past, past))
        os.utime(spec, (past, past))
        os.utime(spec.parent, (past, past))
        _gzip_csv(self.root / "tvt_data" / "all_snippets.csv.gz", 50)
        snippet = self.root / "tvt_data" / "all_snippets.csv.gz"
        os.utime(snippet, (past, past))
        keras = self.root / "models" / "demo.keras"
        _write(keras, "ckpt")
        os.utime(keras, (past, past))

        first = self._inspect()
        self.assertEqual(self._step(first, "create-spectrograms")["status"], "done")
        self.assertEqual(self._step(first, "create-snippet-table")["status"], "done")
        self.assertEqual(self._step(first, "train")["status"], "done")

        param = self.root / "fjord_orcai_parameter.json"
        data = json.loads(param.read_text(encoding="utf-8"))
        data["model"]["n_batch_train"] = 1  # clamp-like rewrite of model only
        param.write_text(json.dumps(data, indent=4), encoding="utf-8")

        after = self._inspect()
        self.assertEqual(self._step(after, "create-spectrograms")["status"], "done")
        self.assertEqual(self._step(after, "create-snippet-table")["status"], "done")
        self.assertEqual(self._step(after, "train")["status"], "stale")
        self.assertEqual(self._step(after, "train")["reason"], "params_changed")

    def test_snippets_vs_n_batch_times_batch_size(self) -> None:
        _gzip_csv(self.root / "tvt_data" / "all_snippets.csv.gz", 50)
        payload = self._inspect()
        snippets = payload["readiness"]["snippets"]
        self.assertEqual(snippets["n_batch"], 2)
        self.assertEqual(snippets["batch_size"], 64)
        self.assertEqual(snippets["required"], 128)
        self.assertEqual(snippets["actual"], 50)
        # orcAI fidelity: actual < n_batch x batch_size -> warn (CLI would ValueError).
        self.assertEqual(snippets["state"], "warn")

    def test_snippets_readiness_reports_train_when_train_is_worst_shortfall(self) -> None:
        path = self.root / "tvt_data" / "all_snippets.csv.gz"
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            handle.write("recording,data_type\n")
            for i in range(40):
                handle.write(f"rec{i},train\n")
            for i in range(80):
                handle.write(f"val{i},val\n")
            for i in range(80):
                handle.write(f"test{i},test\n")
        payload = self._inspect()
        snippets = payload["readiness"]["snippets"]
        # required = 2 x 64 = 128; raw file has 200 rows but only 40 train -> worst split.
        self.assertEqual(snippets["actual"], 40)
        self.assertEqual(snippets["required"], 128)
        self.assertEqual(snippets["state"], "warn")
        self.assertEqual(snippets["split"], "train")

    def test_snippets_readiness_warns_on_val_shortfall_when_train_ok(self) -> None:
        """orcAI raises per-split; train-only lamp would miss a val shortfall."""
        path = self.root / "tvt_data" / "all_snippets.csv.gz"
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            handle.write("recording,data_type\n")
            for i in range(200):
                handle.write(f"rec{i},train\n")
            for i in range(10):
                handle.write(f"val{i},val\n")
            for i in range(200):
                handle.write(f"test{i},test\n")
        # n_batch_train=2 → need 128 train (OK); n_batch_val=1 → need 64 val (short).
        payload = self._inspect()
        snippets = payload["readiness"]["snippets"]
        self.assertEqual(snippets["state"], "warn")
        self.assertEqual(snippets["split"], "val")
        self.assertEqual(snippets["actual"], 10)
        self.assertEqual(snippets["required"], 64)
        self.assertEqual(snippets["n_batch"], 1)

    def test_snippets_readiness_ok_when_inventory_meets_request(self) -> None:
        path = self.root / "tvt_data" / "all_snippets.csv.gz"
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            handle.write("recording,data_type\n")
            for i in range(128):
                handle.write(f"rec{i},train\n")
            for i in range(64):
                handle.write(f"val{i},val\n")
            for i in range(64):
                handle.write(f"test{i},test\n")
        payload = self._inspect()
        snippets = payload["readiness"]["snippets"]
        self.assertEqual(snippets["actual"], 128)
        self.assertEqual(snippets["required"], 128)
        self.assertEqual(snippets["state"], "ok")
        self.assertEqual(snippets["split"], "train")

    def test_pending_job_is_queued_not_running(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        _write(self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json", "{}")
        jobs = [
            {
                "id": "j-train",
                "command": "train",
                "status": "running",
                "updated_at": time.time(),
                "progress": 0.2,
                "params": {"project_dir": str(self.root)},
            },
            {
                "id": "j-test",
                "command": "test",
                "status": "pending",
                "updated_at": time.time(),
                "progress": 0.0,
                "params": {"project_dir": str(self.root)},
            },
        ]
        payload = self._inspect(jobs)
        self.assertEqual(self._step(payload, "train")["status"], "running")
        self.assertEqual(self._step(payload, "test")["status"], "queued")
        self.assertFalse(self._step(payload, "test")["can_run"])
        self.assertIsNone(payload.get("active_plan"))

    def test_active_plan_from_wizard_plan_id(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        now = time.time()
        jobs = [
            {
                "id": "j-spec",
                "command": "create-spectrograms",
                "status": "running",
                "updated_at": now,
                "progress": 0.1,
                "params": {"project_dir": str(self.root), "plan_id": "plan-abc"},
            },
            {
                "id": "j-lab",
                "command": "create-label-arrays",
                "status": "pending",
                "updated_at": now,
                "progress": 0.0,
                "params": {"project_dir": str(self.root), "plan_id": "plan-abc"},
            },
            {
                "id": "j-other",
                "command": "train",
                "status": "pending",
                "updated_at": now,
                "progress": 0.0,
                "params": {"project_dir": str(self.root), "plan_id": "other-plan"},
            },
        ]
        payload = self._inspect(jobs)
        plan = payload.get("active_plan")
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["plan_id"], "plan-abc")
        self.assertEqual(plan["running"], 1)
        self.assertEqual(plan["queued"], 1)
        self.assertEqual(plan["job_id"], "j-spec")
        self.assertFalse(plan.get("includes_hpsearch"))
        self.assertIn("create-spectrograms", plan.get("commands") or [])
        self.assertNotIn("hpsearch", plan.get("commands") or [])

    def test_board_train_does_not_sticky_apply_best_hyperparameters(self) -> None:
        """QA-15: leftover best_hyperparameters.json must not retune every board Train."""
        best = self.root / "hpsearch" / "run1" / "best_hyperparameters.json"
        best.parent.mkdir(parents=True, exist_ok=True)
        best.write_text('{"filters": [1, 2]}', encoding="utf-8")
        payload = self._inspect()
        train = self._step(payload, "train")
        params = train.get("run_params") or {}
        self.assertFalse(params.get("apply_best_hyperparameters"))

        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        now = time.time()
        jobs = [
            {
                "id": "j-tvt",
                "command": "create-tvt-data",
                "status": "succeeded",
                "updated_at": now - 10,
                "progress": 1.0,
                "params": {"project_dir": str(self.root), "plan_id": "plan-hps"},
            },
            {
                "id": "j-hps",
                "command": "hpsearch",
                "status": "pending",
                "updated_at": now,
                "progress": 0.0,
                "params": {"project_dir": str(self.root), "plan_id": "plan-hps"},
            },
            {
                "id": "j-train",
                "command": "train",
                "status": "pending",
                "updated_at": now,
                "progress": 0.0,
                "params": {"project_dir": str(self.root), "plan_id": "plan-hps"},
            },
        ]
        payload = self._inspect(jobs)
        plan = payload.get("active_plan")
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["plan_id"], "plan-hps")
        self.assertTrue(plan.get("includes_hpsearch"))
        self.assertIn("hpsearch", plan.get("commands") or [])

    def test_running_job_overrides_disk_done(self) -> None:
        table = self.root / "recording_table.csv"
        table.write_text("recording,channel\nrec1,0\n", encoding="utf-8")
        _write(self.root / "spectrograms" / "rec1" / "spectrogram" / "times.json", "{}")
        jobs = [
            {
                "id": "j1",
                "command": "create-spectrograms",
                "status": "running",
                "updated_at": time.time(),
                "progress": 0.4,
                "params": {"project_dir": str(self.root)},
            }
        ]
        payload = self._inspect(jobs)
        step = self._step(payload, "create-spectrograms")
        self.assertEqual(step["status"], "running")
        self.assertEqual(step["job_id"], "j1")
        self.assertFalse(step["can_run"])

    def test_hpsearch_optional_does_not_block_train(self) -> None:
        for name in ("train", "val", "test"):
            _gzip_csv(self.root / "tvt_data" / f"{name}.csv.gz", 4)
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        payload = self._inspect()
        self.assertEqual(self._step(payload, "hpsearch")["status"], "idle")
        self.assertTrue(self._step(payload, "hpsearch")["optional"])
        self.assertEqual(self._step(payload, "train")["status"], "idle")
        self.assertIsNone(self._step(payload, "train")["reason"])

    def test_test_blocked_until_keras_checkpoint(self) -> None:
        payload = self._inspect()
        self.assertEqual(self._step(payload, "test")["reason"], "missing_checkpoint")
        keras = self.root / "models" / "demo.keras"
        _write(keras, "ckpt")
        after = self._inspect()
        self.assertEqual(self._step(after, "test")["status"], "idle")
        self.assertIsNone(self._step(after, "test")["reason"])

    def test_disk_readiness_off_when_free_below_needed(self) -> None:
        # No spectrograms / TVT → estimate uses WAV size + snippet budget.
        wav = self.root / "recordings" / "a.wav"
        wav.parent.mkdir(parents=True, exist_ok=True)
        wav.write_bytes(b"0" * 10_000)
        with patch(
            "orcai_desktop_sidecar.train_pipeline.shutil.disk_usage",
            return_value=type("DU", (), {"free": 1_000, "total": 10_000, "used": 9_000})(),
        ):
            payload = self._inspect()
        disk = payload["readiness"]["disk"]
        self.assertGreater(disk["needed_bytes"], 1_000)
        self.assertEqual(disk["free_bytes"], 1_000)
        self.assertEqual(disk["state"], "off")

    def test_disk_readiness_warn_within_headroom_band(self) -> None:
        wav = self.root / "recordings" / "a.wav"
        wav.parent.mkdir(parents=True, exist_ok=True)
        wav.write_bytes(b"0" * 10_000)
        # needed ~ wav + snippets; pick free between needed and 1.4x needed.
        with patch(
            "orcai_desktop_sidecar.train_pipeline.shutil.disk_usage",
        ) as du:
            # First call inside inspect to compute needed, then we re-check via helper.
            du.return_value = type("DU", (), {"free": 10**12, "total": 10**12, "used": 0})()
            baseline = self._inspect()["readiness"]["disk"]["needed_bytes"]
            self.assertGreater(baseline, 0)
            mid = int(baseline + (baseline * 0.2))
            du.return_value = type("DU", (), {"free": mid, "total": mid * 2, "used": mid})()
            payload = self._inspect()
        self.assertEqual(payload["readiness"]["disk"]["state"], "warn")

    def test_hpsearch_run_params_include_project_hps_file(self) -> None:
        """TRN-01: board Run on hpsearch must pass wizard-written -hp when present."""
        for name in ("train", "val", "test"):
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        hps = self.root / "demo_hps_parameter.json"
        hps.write_text('{"filters":{"set1":[8]}}\n', encoding="utf-8")
        # Parameter name from _param() is "demo" → demo_hps_parameter.json.
        payload = self._inspect()
        hp_step = self._step(payload, "hpsearch")
        self.assertEqual(
            Path(hp_step["run_params"]["hps_parameter"]).resolve(),
            hps.resolve(),
        )

    def test_hpsearch_run_params_omit_hps_when_missing(self) -> None:
        for name in ("train", "val", "test"):
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        payload = self._inspect()
        hp_step = self._step(payload, "hpsearch")
        self.assertNotIn("hps_parameter", hp_step["run_params"])

    def test_label_arrays_run_params_include_call_equivalences(self) -> None:
        """QA-C1: board create-label-arrays must pass wizard -ce when present."""
        eq = self.root / "call_equivalences.json"
        eq.write_text('{"buzz":"BUZZ","BUZZ":"BUZZ"}\n', encoding="utf-8")
        payload = self._inspect()
        step = self._step(payload, "create-label-arrays")
        self.assertEqual(
            Path(step["run_params"]["call_equivalences"]).resolve(),
            eq.resolve(),
        )

    def test_label_arrays_run_params_omit_ce_when_missing(self) -> None:
        payload = self._inspect()
        step = self._step(payload, "create-label-arrays")
        self.assertNotIn("call_equivalences", step["run_params"])

    def test_tvt_and_test_run_params_unfiltered_from_artifact(self) -> None:
        """QA-C2: existing test_unfiltered.csv.gz → -uts / -tu on board re-run."""
        for name in ("train", "val", "test"):
            _gzip_csv(self.root / "tvt_data" / f"{name}.csv.gz", 4)
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        _gzip_csv(self.root / "tvt_data" / "test_unfiltered.csv.gz", 4)
        _gzip_csv(self.root / "tvt_data" / "all_snippets.csv.gz", 8)
        payload = self._inspect()
        snip = self._step(payload, "create-tvt-snippet-tables")
        self.assertTrue(snip["run_params"].get("create_unfiltered_test_snippets"))
        test = self._step(payload, "test")
        self.assertTrue(test["run_params"].get("test_unfiltered"))

    def test_tvt_unfiltered_from_prior_wizard_job(self) -> None:
        for name in ("train", "val", "test"):
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        jobs = [
            {
                "id": "j1",
                "command": "create-tvt-snippet-tables",
                "status": "succeeded",
                "updated_at": time.time(),
                "params": {
                    "project_dir": str(self.root),
                    "create_unfiltered_test_snippets": True,
                },
            }
        ]
        payload = self._inspect(jobs=jobs)
        snip = self._step(payload, "create-tvt-snippet-tables")
        self.assertTrue(snip["run_params"].get("create_unfiltered_test_snippets"))

    def test_train_run_params_reuse_finetune_lmf(self) -> None:
        """QA-C3: board train reuses -lmf from the latest finetune train job."""
        for name in ("train", "val", "test"):
            (self.root / "tvt_data" / f"{name}_dataset").mkdir(parents=True)
            _write(self.root / "tvt_data" / f"{name}_dataset" / "part", "tf")
        base = self.root / "models" / "orcai-isl-v1"
        base.mkdir(parents=True)
        jobs = [
            {
                "id": "t1",
                "command": "train",
                "status": "succeeded",
                "updated_at": time.time(),
                "params": {
                    "project_dir": str(self.root),
                    "load_model": True,
                    "load_model_from": str(base),
                },
            }
        ]
        payload = self._inspect(jobs=jobs)
        train = self._step(payload, "train")
        self.assertEqual(
            Path(train["run_params"]["load_model"]).resolve(),
            base.resolve(),
        )


class DiskReadinessHelperTests(unittest.TestCase):
    def test_thresholds(self) -> None:
        self.assertEqual(
            disk_readiness_state(free_bytes=100, needed_bytes=0, measured=True),
            "ok",
        )
        self.assertEqual(
            disk_readiness_state(free_bytes=50, needed_bytes=100, measured=True),
            "off",
        )
        self.assertEqual(
            disk_readiness_state(free_bytes=120, needed_bytes=100, measured=True),
            "warn",
        )
        self.assertEqual(
            disk_readiness_state(free_bytes=200, needed_bytes=100, measured=True),
            "ok",
        )
        self.assertEqual(
            disk_readiness_state(free_bytes=0, needed_bytes=100, measured=False),
            "warn",
        )

    def test_estimate_never_zero_while_pipeline_incomplete(self) -> None:
        # Specs missing, no WAV sizes, no n_batch → still a positive floor.
        needed = estimate_pipeline_disk_needed(
            wav_bytes=0,
            table_rows=3,
            spec_count=0,
            label_count=0,
            tvt_data_ready=False,
            train_ready=False,
            required_snippets=0,
            snippet_rows=None,
            n_batch_train=0,
            n_batch_val=0,
            n_batch_test=0,
            batch_size=0,
        )
        self.assertGreater(needed, 100_000_000)

    def test_estimate_zero_when_artifacts_ready(self) -> None:
        needed = estimate_pipeline_disk_needed(
            wav_bytes=10_000_000,
            table_rows=2,
            spec_count=2,
            label_count=2,
            tvt_data_ready=True,
            train_ready=True,
            required_snippets=128,
            snippet_rows=200,
            n_batch_train=2,
            n_batch_val=1,
            n_batch_test=1,
            batch_size=64,
        )
        self.assertEqual(needed, 0)

    def test_estimate_uses_remaining_wav_fraction(self) -> None:
        needed = estimate_pipeline_disk_needed(
            wav_bytes=10_000_000,
            table_rows=10,
            spec_count=5,
            label_count=5,
            tvt_data_ready=True,
            train_ready=True,
            required_snippets=0,
            snippet_rows=None,
            n_batch_train=0,
            n_batch_val=0,
            n_batch_test=0,
            batch_size=0,
        )
        # Half the recordings still need ~2x WAV share.
        self.assertEqual(needed, int(10_000_000 * 0.5 * 2.0))


class TrainPipelineApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_get_project_pipeline_404(self) -> None:
        from orcai_desktop_sidecar.train_pipeline import get_project_pipeline

        with self.assertRaises(FileNotFoundError):
            get_project_pipeline("missing")


if __name__ == "__main__":
    unittest.main()
