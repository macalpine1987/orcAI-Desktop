"""Train monitor snapshot — offline unit tests."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from orcai_desktop_sidecar.train_monitor import inspect_train_monitor


class TrainMonitorTests(unittest.TestCase):
    def test_idle_snapshot_from_parameter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps(
                    {
                        "name": "demo-model",
                        "model": {
                            "epochs": 30,
                            "batch_size": 64,
                            "n_batch_train": 100,
                            "monitor": "val_MBA",
                            "EarlyStopping_patience": 10,
                            "ReduceLROnPlateau_patience": 5,
                        },
                    }
                ),
                encoding="utf-8",
            )
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=[])
            self.assertEqual(snap["phase"], "idle")
            self.assertEqual(snap["model_name"], "demo-model")
            self.assertEqual(snap["epochs"], 30)
            self.assertFalse(snap["can_stop"])

    def test_live_state_and_running_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps({"name": "m1", "model": {"epochs": 30, "monitor": "val_MBA"}}),
                encoding="utf-8",
            )
            model_dir = root / "models" / "m1"
            model_dir.mkdir(parents=True)
            (model_dir / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            (model_dir / "desktop_train_monitor.json").write_text(
                json.dumps(
                    {
                        "job_id": "job-1",
                        "epoch": 3,
                        "epochs": 30,
                        "batch": 50,
                        "batches": 200,
                        "metrics": {"val_MBA": 0.8, "loss": 0.2, "learning_rate": 1e-4},
                        "history": {"val_MBA": [0.5, 0.7, 0.8], "MBA": [0.4, 0.6, 0.75]},
                        "best_value": 0.8,
                        "best_epoch": 3,
                        "epochs_since_best": 0,
                        "elapsed_sec": 120,
                        "remaining_sec": 1000,
                    }
                ),
                encoding="utf-8",
            )
            jobs = [
                {
                    "id": "job-1",
                    "command": "train",
                    "status": "running",
                    "updated_at": 100.0,
                    "params": {"project_dir": str(root), "output_dir": str(root / "models")},
                }
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["phase"], "running")
            self.assertEqual(snap["epoch"], 3)
            self.assertEqual(snap["job_id"], "job-1")
            self.assertTrue(snap["can_stop"])
            # No compression_type on job → orcAI default
            self.assertEqual(snap["dataset"]["compression"], "GZIP")
            self.assertIn("started_at", snap)
            self.assertAlmostEqual(snap["metrics"]["val_MBA"], 0.8)
            self.assertEqual(len(snap["history"]["val_MBA"]), 3)
            self.assertIsNone(snap.get("job_error"))

    def test_reduce_lr_waits_on_keras_counter_not_early_stop(self) -> None:
        """A learning-rate drop resets ReduceLR wait while early stop keeps counting."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps(
                    {
                        "name": "m1",
                        "model": {
                            "epochs": 30,
                            "monitor": "val_MBA",
                            "EarlyStopping_patience": 10,
                            "ReduceLROnPlateau_patience": 5,
                        },
                    }
                ),
                encoding="utf-8",
            )
            model_dir = root / "models" / "m1"
            model_dir.mkdir(parents=True)
            (model_dir / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            (model_dir / "desktop_train_monitor.json").write_text(
                json.dumps(
                    {
                        "job_id": "job-1",
                        "epoch": 8,
                        "epochs": 30,
                        "epochs_since_best": 4,
                        "metrics": {"val_MBA": 0.7, "learning_rate": 5e-5},
                        "reduce_lr": {
                            "wait": 1,
                            "patience": 5,
                            "cooldown": 0,
                            "at_min_lr": False,
                            "in_epochs": 4,
                        },
                    }
                ),
                encoding="utf-8",
            )
            jobs = [
                {
                    "id": "job-1",
                    "command": "train",
                    "status": "running",
                    "updated_at": 100.0,
                    "params": {"project_dir": str(root), "output_dir": str(root / "models")},
                }
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["early_stopping"]["epochs_since_best"], 4)
            self.assertEqual(snap["early_stopping"]["remaining"], 6)
            self.assertEqual(snap["reduce_lr"]["epochs_since_best"], 1)
            self.assertEqual(snap["reduce_lr"]["in_epochs"], 4)
            self.assertEqual(snap["reduce_lr"]["source"], "keras")

    def test_reduce_lr_epochs_until_reads_callback(self) -> None:
        from orcai_desktop_sidecar.train_live import (
            read_reduce_lr_callback,
            reduce_lr_epochs_until,
        )

        self.assertEqual(
            reduce_lr_epochs_until(wait=2, patience=5, cooldown=0, at_min_lr=False),
            3,
        )
        self.assertEqual(
            reduce_lr_epochs_until(wait=0, patience=5, cooldown=2, at_min_lr=False),
            7,
        )
        self.assertIsNone(
            reduce_lr_epochs_until(wait=5, patience=5, cooldown=0, at_min_lr=True)
        )

        class ReduceLROnPlateau:
            wait = 2
            patience = 5
            cooldown_counter = 0
            min_lr = 1e-7

        class Model:
            def __init__(self) -> None:
                self.callbacks = [ReduceLROnPlateau()]

        snap = read_reduce_lr_callback(Model(), 1e-4)
        assert snap is not None
        self.assertEqual(snap["in_epochs"], 3)
        self.assertFalse(snap["at_min_lr"])
        floored = read_reduce_lr_callback(Model(), 1e-7)
        assert floored is not None
        self.assertTrue(floored["at_min_lr"])
        self.assertIsNone(floored["in_epochs"])

    def test_pending_train_can_stop(self) -> None:
        """TRN-03: Stop must work while train is queued, not only running."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps({"name": "m1", "model": {"epochs": 10}}),
                encoding="utf-8",
            )
            jobs = [
                {
                    "id": "job-pending",
                    "command": "train",
                    "status": "pending",
                    "updated_at": 50.0,
                    "params": {"project_dir": str(root), "output_dir": str(root / "models")},
                }
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["phase"], "queued")
            self.assertTrue(snap["can_stop"])
            self.assertEqual(snap["job_id"], "job-pending")

    def test_compression_from_train_job_params(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps({"name": "m1", "model": {"epochs": 10}}),
                encoding="utf-8",
            )
            jobs = [
                {
                    "id": "job-tvt",
                    "command": "create-tvt-data",
                    "status": "completed",
                    "updated_at": 50.0,
                    "params": {
                        "project_dir": str(root),
                        "tvt_dir": str(root / "tvt_data"),
                        "compression_type": None,
                    },
                },
                {
                    "id": "job-train",
                    "command": "train",
                    "status": "running",
                    "updated_at": 100.0,
                    "params": {
                        "project_dir": str(root),
                        "output_dir": str(root / "models"),
                        "compression_type": None,
                    },
                },
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["dataset"]["compression"], "None")

            jobs[1]["params"]["compression_type"] = "GZIP"
            snap2 = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap2["dataset"]["compression"], "GZIP")

    def test_merge_history_prefers_longer_series(self) -> None:
        from orcai_desktop_sidecar.train_monitor import _merge_history

        live = {"history": {"val_MBA": [0.1, 0.2]}}
        file_hist = {"val_MBA": [0.1, 0.2, 0.3, 0.4]}
        merged = _merge_history(live, file_hist)
        self.assertEqual(merged["val_MBA"], file_hist["val_MBA"])
        live2 = {"history": {"val_MBA": [0.1, 0.2, 0.3, 0.4, 0.5]}}
        merged2 = _merge_history(live2, file_hist)
        self.assertEqual(len(merged2["val_MBA"]), 5)

    def test_merge_history_active_job_ignores_old_file(self) -> None:
        from orcai_desktop_sidecar.train_monitor import _merge_history

        live = {
            "job_id": "job-new",
            "history": {"val_MBA": [0.55]},
        }
        file_hist = {"val_MBA": [0.5, 0.6, 0.7, 0.8]}
        merged = _merge_history(
            live,
            file_hist,
            active_job_id="job-new",
            job_status="running",
        )
        self.assertEqual(merged["val_MBA"], [0.55])

        stale = _merge_history(
            {"job_id": "job-old", "history": {"val_MBA": [0.9]}},
            file_hist,
            active_job_id="job-new",
            job_status="pending",
        )
        self.assertEqual(stale, {})

    def test_retrain_clears_stale_curve_for_new_job(self) -> None:
        """Same model_dir + new train job → do not show previous run's history."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps({"name": "m1", "model": {"epochs": 30, "monitor": "val_MBA"}}),
                encoding="utf-8",
            )
            model_dir = root / "models" / "m1"
            model_dir.mkdir(parents=True)
            (model_dir / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            (model_dir / "training_history.json").write_text(
                json.dumps({"val_MBA": [0.5, 0.6, 0.7], "MBA": [0.4, 0.5, 0.65]}),
                encoding="utf-8",
            )
            (model_dir / "desktop_train_monitor.json").write_text(
                json.dumps(
                    {
                        "job_id": "job-old",
                        "epoch": 3,
                        "epochs": 30,
                        "history": {"val_MBA": [0.5, 0.6, 0.7]},
                        "metrics": {"val_MBA": 0.7},
                        "best_value": 0.7,
                        "best_epoch": 3,
                    }
                ),
                encoding="utf-8",
            )
            jobs = [
                {
                    "id": "job-new",
                    "command": "train",
                    "status": "running",
                    "updated_at": 200.0,
                    "params": {
                        "project_dir": str(root),
                        "output_dir": str(root / "models"),
                    },
                }
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["phase"], "running")
            self.assertEqual(snap["history"], {})
            self.assertEqual(snap["epoch"], 0)
            self.assertIsNone(snap["metrics"]["val_MBA"])
            self.assertIsNone(snap["best_value"])

    def test_reset_train_monitor_session_writes_empty_live(self) -> None:
        from orcai_desktop_sidecar.train_live import (
            read_live_state,
            reset_train_monitor_session,
        )

        with tempfile.TemporaryDirectory() as tmp:
            model_dir = Path(tmp) / "m1"
            model_dir.mkdir()
            (model_dir / "desktop_train_monitor.json").write_text(
                json.dumps({"job_id": "old", "history": {"val_MBA": [0.9]}}),
                encoding="utf-8",
            )
            reset_train_monitor_session(
                job_id="job-2",
                model_dir=model_dir,
                epochs=20,
                batches_per_epoch=100,
                monitor_metric="val_MBA",
                early_stopping_patience=10,
            )
            live = read_live_state(model_dir)
            assert live is not None
            self.assertEqual(live["job_id"], "job-2")
            self.assertEqual(live["history"], {})
            self.assertEqual(live["epoch"], 0)
            self.assertTrue(live.get("session_reset"))

    def test_failed_job_exposes_job_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "demo_orcai_parameter.json").write_text(
                json.dumps({"name": "m1", "model": {"epochs": 30, "monitor": "val_MBA"}}),
                encoding="utf-8",
            )
            model_dir = root / "models" / "m1"
            model_dir.mkdir(parents=True)
            (model_dir / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            jobs = [
                {
                    "id": "job-fail",
                    "command": "train",
                    "status": "failed",
                    "updated_at": 100.0,
                    "error": "inflate() failed with error -3: incorrect header check",
                    "params": {"project_dir": str(root), "output_dir": str(root / "models")},
                }
            ]
            snap = inspect_train_monitor(root, orcai_name="demo", jobs=jobs)
            self.assertEqual(snap["phase"], "error")
            self.assertIn("incorrect header check", snap["job_error"] or "")

    def test_adapter_batches_per_epoch_uses_n_batch_train(self) -> None:
        """Regression: n_batch_train is batches/epoch — not samples (batch_size × n)."""
        src = (
            Path(__file__).resolve().parents[1]
            / "src"
            / "orcai_desktop_sidecar"
            / "adapters"
            / "training.py"
        )
        text = src.read_text(encoding="utf-8")
        self.assertNotIn("batch_size * n_batch", text)
        self.assertIn("batches = n_batch if n_batch > 0 else None", text)

    def test_live_mid_epoch_keeps_val_metrics(self) -> None:
        """Batch logs must not overwrite last val_* (validation is once per epoch)."""
        live_src = (
            Path(__file__).resolve().parents[1]
            / "src"
            / "orcai_desktop_sidecar"
            / "train_live.py"
        ).read_text(encoding="utf-8")
        self.assertIn('name.startswith("val_")', live_src)
        self.assertIn("on_train_batch_end", live_src)

        last_logs = {"val_MBA": 0.81, "loss": 0.5, "MBA": 0.7}
        for key, value in {"loss": 0.42, "MBA": 0.73, "val_MBA": 0.99}.items():
            name = str(key)
            if name in ("batch", "size") or name.startswith("val_"):
                continue
            last_logs[name] = float(value)
        self.assertEqual(last_logs["val_MBA"], 0.81)
        self.assertAlmostEqual(last_logs["loss"], 0.42)
        self.assertAlmostEqual(last_logs["MBA"], 0.73)

    def test_fit_callback_stops_when_the_job_is_cancelled(self) -> None:
        live_src = (
            Path(__file__).resolve().parents[1]
            / "src"
            / "orcai_desktop_sidecar"
            / "train_live.py"
        ).read_text(encoding="utf-8")
        self.assertIn("_abort_if_cancelled", live_src)
        self.assertIn("model.stop_training = True", live_src)
        end = live_src.index("def on_train_end")
        abort = live_src.index("def _abort_if_cancelled")
        self.assertNotIn("_abort_if_cancelled", live_src[end:abort])


if __name__ == "__main__":
    unittest.main()
