"""Full unit coverage: CLI, engine_call, queue, stream, cancel, runner, API."""

from __future__ import annotations

import os
import queue
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ORCAI_FORCE_INPROCESS_JOBS", "1")

from orcai_desktop_sidecar import jobs
from orcai_desktop_sidecar.cancel_cleanup import cleanup_partial_artifacts
from orcai_desktop_sidecar.cli_command import (
    _POSITIONALS,
    build_command_line,
    normalize_job_params,
)
from orcai_desktop_sidecar.engine_call import (
    abs_path,
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
    snapshot_files,
)
from orcai_desktop_sidecar.job_queue import JobScheduler
from orcai_desktop_sidecar.job_stream import publish, subscribe, unsubscribe
from orcai_desktop_sidecar.jobs import (
    JobStatus,
    append_log,
    cancel_job,
    create_job,
    get_job,
    job_to_dict,
    set_progress,
    set_status,
)
from orcai_desktop_sidecar.messenger import JobMessenger
from orcai_desktop_sidecar.runner import IMPLEMENTED_COMMANDS, _absolute_created_files, run_job

TWELVE = (
    "init",
    "create-recording-table",
    "predict",
    "filter-predictions",
    "create-spectrograms",
    "create-label-arrays",
    "create-snippet-table",
    "create-tvt-snippet-tables",
    "create-tvt-data",
    "hpsearch",
    "train",
    "test",
)


def _reset_jobs() -> None:
    jobs._bootstrapped = False
    jobs._jobs.clear()


class _JobsFixture(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()
        _reset_jobs()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()
        _reset_jobs()


# ---------------------------------------------------------------------------
# CLI command line (п.4)
# ---------------------------------------------------------------------------


class CliFullCoverageTests(unittest.TestCase):
    def test_all_twelve_commands_have_positionals(self) -> None:
        for cmd in TWELVE:
            self.assertIn(cmd, _POSITIONALS, msg=f"missing positionals for {cmd}")

    def test_implemented_commands_match_twelve(self) -> None:
        for cmd in TWELVE:
            self.assertIn(cmd, IMPLEMENTED_COMMANDS)

    def test_init_positional_not_legacy_flags(self) -> None:
        line = build_command_line(
            "init", {"project_dir": "/p", "project_name": "n", "verbosity": 3}
        )
        self.assertEqual(line.split()[0:2], ["orcai", "init"])
        self.assertIn("/p", line)
        self.assertIn("n", line)
        self.assertIn("-v", line)
        self.assertNotIn("--path", line)

    def test_init_legacy_path_name_aliases(self) -> None:
        n = normalize_job_params("init", {"path": "/p", "name": "n"})
        self.assertEqual(n["project_dir"], "/p")
        self.assertEqual(n["project_name"], "n")

    def test_bool_flags_only_when_true(self) -> None:
        line_true = build_command_line(
            "predict", {"recording_path": "/a.wav", "overwrite": True}
        )
        line_false = build_command_line(
            "predict", {"recording_path": "/a.wav", "overwrite": False}
        )
        self.assertIn("-ow", line_true)
        self.assertNotIn("-ow", line_false)

    def test_spaces_in_paths_are_quoted(self) -> None:
        line = build_command_line("predict", {"recording_path": "/tmp/my file.wav"})
        self.assertTrue(
            "'/tmp/my file.wav'" in line or '"/tmp/my file.wav"' in line,
            msg=line,
        )

    def test_filter_predicted_labels_path_alias(self) -> None:
        line = build_command_line(
            "filter-predictions", {"predicted_labels_path": "/a_predicted.txt"}
        )
        self.assertIn("/a_predicted.txt", line)
        self.assertIn("filter-predictions", line)

    def test_train_load_model_path_becomes_lm_and_lmf(self) -> None:
        n = normalize_job_params("train", {"load_model": "/models/prev"})
        self.assertTrue(n["load_model"])
        self.assertEqual(n["load_model_from"], "/models/prev")
        line = build_command_line(
            "train",
            {
                "data_dir": "/d",
                "output_dir": "/o",
                "load_model": "/models/prev",
            },
        )
        self.assertIn("-lm", line)
        self.assertIn("-lmf", line)

    def test_create_recording_table_strips_desktop_overwrite(self) -> None:
        n = normalize_job_params(
            "create-recording-table",
            {"base_dir_recording": "/w", "overwrite": True},
        )
        self.assertNotIn("overwrite", n)
        line = build_command_line(
            "create-recording-table",
            {"base_dir_recording": "/w", "overwrite": True, "default_channel": 2},
        )
        self.assertIn("-dc", line)
        self.assertNotIn("-ow", line)

    def test_snippet_table_output_path_alias(self) -> None:
        line = build_command_line(
            "create-snippet-table",
            {
                "recording_table_path": "/rt.csv",
                "recording_data_dir": "/rd",
                "output_path": "/out.csv",
            },
        )
        self.assertIn("-o", line)
        self.assertIn("/out.csv", line)

    def test_columns_not_emitted_as_fake_cli_flag(self) -> None:
        """orcAI 3.0.2 CLI has no -col; columns stay Python-API only."""
        line = build_command_line(
            "filter-predictions",
            {
                "predicted_labels": "/a.txt",
                "columns": ["start", "stop", "label"],
            },
        )
        self.assertNotIn("-col", line)
        self.assertNotIn("start,stop,label", line)

    def test_compression_none_string_normalized(self) -> None:
        n = normalize_job_params("train", {"compression_type": "None"})
        self.assertIsNone(n["compression_type"])


# ---------------------------------------------------------------------------
# engine_kwargs / artifacts helpers (п.1, п.7)
# ---------------------------------------------------------------------------


class EngineCallFullTests(unittest.TestCase):
    def test_required_missing_raises(self) -> None:
        def fn(a: str, b: int = 1) -> None:
            return None

        with self.assertRaises(ValueError):
            engine_kwargs(fn, {}, required=("a",))

    def test_rename_mapping(self) -> None:
        def fn(engine_name: str) -> None:
            return None

        kw = engine_kwargs(
            fn, {"job_key": "/x"}, rename={"engine_name": "job_key"}
        )
        self.assertEqual(kw, {"engine_name": "/x"})

    def test_inject_beats_skip(self) -> None:
        def fn(msgr: object | None = None, x: int = 1) -> None:
            return None

        sentinel = object()
        kw = engine_kwargs(
            fn,
            {"x": 2},
            inject={"msgr": sentinel},
            skip=frozenset({"msgr"}),
        )
        self.assertIs(kw["msgr"], sentinel)
        self.assertEqual(kw["x"], 2)

    def test_abs_path_filters_default(self) -> None:
        self.assertIsNone(abs_path(None))
        self.assertIsNone(abs_path(""))
        self.assertIsNone(abs_path("default"))
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "f.txt"
            p.write_text("a", encoding="utf-8")
            self.assertEqual(abs_path(p), str(p.resolve()))

    def test_cli_params_strips_msgr(self) -> None:
        out = cli_params_from_engine({"msgr": object(), "a": 1}, b=2)
        self.assertNotIn("msgr", out)
        self.assertEqual(out["a"], 1)
        self.assertEqual(out["b"], 2)

    def test_snapshot_files_file_and_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            f = root / "a.txt"
            f.write_text("x", encoding="utf-8")
            self.assertEqual(snapshot_files(f), {str(f.resolve())})
            self.assertEqual(snapshot_files(root / "missing"), set())
            self.assertEqual(snapshot_files(None), set())

    def test_collect_created_dir_fallback_without_before(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            created = collect_created(root=root)
            self.assertEqual(created, [str(root.resolve())])

    def test_collect_created_skips_dir_candidate_when_before_given(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old.txt"
            old.write_text("x", encoding="utf-8")
            before = snapshot_files(root)
            new = root / "new.txt"
            new.write_text("y", encoding="utf-8")
            created = collect_created(root, before=before, root=root)
            self.assertNotIn(str(root.resolve()), created)
            self.assertIn(str(new.resolve()), created)
            self.assertNotIn(str(old.resolve()), created)


class AbsoluteArtifactsFullTests(unittest.TestCase):
    def test_fallback_output_keys_when_created_files_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            out.mkdir()
            arts = _absolute_created_files({"output_dir": str(out), "created_files": []})
            self.assertEqual(arts, [str(out.resolve())])

    def test_skips_nonexistent_created_files(self) -> None:
        arts = _absolute_created_files(
            {"created_files": ["/no/such/file-orcai-p14.txt"]}
        )
        self.assertEqual(arts, [])

    def test_ignores_default_output_path(self) -> None:
        arts = _absolute_created_files({"output_path": "default", "created_files": []})
        self.assertEqual(arts, [])

    def test_test_command_excludes_model_dir_from_created(self) -> None:
        from orcai_desktop_sidecar.adapters.training import run_test

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = root / "model"
            model.mkdir()
            (model / "weights.keras").write_bytes(b"x")
            (model / "orcai_parameter.json").write_text("{}", encoding="utf-8")
            data = root / "data"
            data.mkdir()

            def fake_test_model(
                model_dir: object,
                data_dir: object,
                test_unfiltered: bool = True,
                output_dir: object = None,
                compression_type: object = "GZIP",
                verbosity: int = 2,
                msgr: object = None,
            ) -> None:
                (model / "metrics_new.json").write_text("{}", encoding="utf-8")

            with patch("orcai.test_models.test_model", new=fake_test_model):
                result = run_test(
                    "job-test-artifacts",
                    {"model_dir": str(model), "data_dir": str(data)},
                )

            created = result.get("created_files") or []
            self.assertNotIn(str(model.resolve()), created)
            self.assertTrue(
                any(Path(p).name == "metrics_new.json" for p in created),
                msg=created,
            )
            self.assertIsNone(result.get("output_dir"))


# ---------------------------------------------------------------------------
# Queue (п.2)
# ---------------------------------------------------------------------------


class SchedulerFullTests(unittest.TestCase):
    def test_cancel_pending_removes_job(self) -> None:
        started: list[str] = []
        hold = threading.Event()

        def block(job_id: str, command: str, params: dict) -> None:
            started.append(job_id)
            hold.wait(timeout=2)
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=1)
        sched.submit("hold", "predict", {}, block, priority=0)
        time.sleep(0.08)
        sched.submit("pending", "predict", {}, block, priority=0)
        self.assertTrue(sched.cancel_pending("pending"))
        snap = sched.snapshot()
        self.assertEqual(snap["max_concurrent"], 1)
        self.assertNotIn("pending", snap["pending"])
        hold.set()
        time.sleep(0.15)
        self.assertEqual(started, ["hold"])

    def test_start_fn_exception_releases_slot(self) -> None:
        started: list[str] = []

        def boom(job_id: str, command: str, params: dict) -> None:
            started.append(job_id)
            raise RuntimeError("boom")

        def ok(job_id: str, command: str, params: dict) -> None:
            started.append(job_id)
            sched.notify_finished(job_id)

        sched = JobScheduler(max_concurrent=1)
        sched.submit("a", "predict", {}, boom, priority=0)
        time.sleep(0.1)
        sched.submit("b", "predict", {}, ok, priority=0)
        time.sleep(0.2)
        self.assertEqual(started, ["a", "b"])


# ---------------------------------------------------------------------------
# Job stream SSE pub/sub (п.3)
# ---------------------------------------------------------------------------


class JobStreamTests(unittest.TestCase):
    def test_subscribe_receives_publish(self) -> None:
        q = subscribe("job-stream-1", maxsize=8)
        try:
            publish("job-stream-1", {"type": "log", "line": "hello", "index": 0})
            item = q.get(timeout=1)
            self.assertEqual(item["type"], "log")
            self.assertEqual(item["line"], "hello")
            self.assertEqual(item["job_id"], "job-stream-1")
            self.assertIn("ts", item)
        finally:
            unsubscribe("job-stream-1", q)

    def test_overflow_prefers_keeping_status(self) -> None:
        q = subscribe("job-stream-2", maxsize=2)
        try:
            publish("job-stream-2", {"type": "log", "line": "1", "index": 0})
            publish("job-stream-2", {"type": "log", "line": "2", "index": 1})
            publish("job-stream-2", {"type": "status", "status": "completed"})
            items = []
            while True:
                try:
                    items.append(q.get_nowait())
                except queue.Empty:
                    break
            types = [i.get("type") for i in items if isinstance(i, dict)]
            self.assertIn("status", types)
        finally:
            unsubscribe("job-stream-2", q)


# ---------------------------------------------------------------------------
# Cancel cleanup (п.6)
# ---------------------------------------------------------------------------


class CancelCleanupTests(unittest.TestCase):
    def test_predict_unlinks_partial_label(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wav = root / "rec.wav"
            wav.write_bytes(b"RIFF")
            model_dir = root / "model"
            model_dir.mkdir()
            (model_dir / "orcai_parameter.json").write_text(
                '{"name": "test-model"}', encoding="utf-8"
            )
            label = root / "rec_c1_test-model_predicted.txt"
            label.write_text("partial", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "predict",
                {
                    "recording_path": str(wav),
                    "channel": 1,
                    "model_dir": str(model_dir),
                },
            )
            self.assertTrue(removed)
            self.assertFalse(label.exists())

    def test_predict_cleanup_keeps_older_label(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wav = root / "rec.wav"
            wav.write_bytes(b"RIFF")
            model_dir = root / "model"
            model_dir.mkdir()
            (model_dir / "orcai_parameter.json").write_text(
                '{"name": "test-model"}', encoding="utf-8"
            )
            label = root / "rec_c1_test-model_predicted.txt"
            label.write_text("previous", encoding="utf-8")
            older = label.stat().st_mtime - 10
            import os

            os.utime(label, (older, older))
            removed = cleanup_partial_artifacts(
                "predict",
                {
                    "recording_path": str(wav),
                    "channel": 1,
                    "model_dir": str(model_dir),
                },
                since=label.stat().st_mtime + 20,
            )
            self.assertEqual(removed, [])
            self.assertTrue(label.exists())

    def test_predict_csv_cleanup_removes_recording_labels_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rec = root / "recordings"
            rec.mkdir()
            wav = rec / "clip.wav"
            wav.write_bytes(b"RIFF")
            model_dir = root / "model"
            model_dir.mkdir()
            (model_dir / "orcai_parameter.json").write_text(
                '{"name": "test-model"}', encoding="utf-8"
            )
            table = root / "recording_table.csv"
            table.write_text(
                "recording,channel,base_dir_recording,rel_recording_path\n"
                f"clip,1,{rec},clip.wav\n",
                encoding="utf-8",
            )
            label = rec / "clip_c1_test-model_predicted.txt"
            label.write_text("partial", encoding="utf-8")
            decoy = root / "recording_table_c1_test-model_predicted.txt"
            decoy.write_text("not a batch output", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "predict",
                {
                    "recording_path": str(table),
                    "project_dir": str(root),
                    "model_dir": str(model_dir),
                    "channel": 1,
                },
            )
            self.assertIn(str(label.resolve()), removed)
            self.assertFalse(label.exists())
            self.assertTrue(decoy.exists())
            self.assertTrue(table.exists())

    def test_filter_unlinks_default_filtered_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pred = Path(tmp) / "a_predicted.txt"
            pred.write_text("x", encoding="utf-8")
            filtered = Path(tmp) / "a_predicted_filtered.txt"
            filtered.write_text("y", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "filter-predictions", {"predicted_labels": str(pred)}
            )
            self.assertTrue(removed)
            self.assertFalse(filtered.exists())

    def test_train_writes_incomplete_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            out.mkdir()
            removed = cleanup_partial_artifacts(
                "train", {"output_dir": str(out), "data_dir": str(tmp)}
            )
            marker = out / ".orcai-desktop-incomplete-train"
            self.assertTrue(marker.is_file())
            self.assertEqual(removed, [str(marker.resolve())])

    def test_create_tvt_data_uses_tvt_dir_alias(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tvt = Path(tmp) / "tvt"
            tvt.mkdir()
            removed = cleanup_partial_artifacts(
                "create-tvt-data", {"tvt_snippet_tables_dir": str(tvt)}
            )
            marker = tvt / ".orcai-desktop-incomplete-create-tvt-data"
            self.assertTrue(marker.is_file())
            self.assertTrue(removed)

    def test_snippet_table_unlinks_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "snippets.csv"
            out.write_text("a", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "create-snippet-table", {"output_path": str(out)}
            )
            self.assertFalse(out.exists())
            self.assertTrue(removed)

    def test_init_marks_incomplete_and_unlinks_parameter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "proj"
            root.mkdir()
            param = root / "demo_orcai_parameter.json"
            param.write_text("{}", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "init",
                {"project_dir": str(root), "project_name": "demo"},
            )
            marker = root / ".orcai-desktop-incomplete-init"
            self.assertTrue(marker.is_file())
            self.assertFalse(param.exists())
            self.assertIn(str(marker.resolve()), removed)

    def test_create_recording_table_unlinks_csv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "wavs"
            base.mkdir()
            csv_path = base / "recording_table.csv"
            csv_path.write_text("x", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "create-recording-table",
                {"base_dir_recording": str(base)},
            )
            self.assertFalse(csv_path.exists())
            self.assertTrue(removed)

    def test_create_recording_table_custom_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "custom.csv"
            out.write_text("x", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "create-recording-table",
                {
                    "base_dir_recording": str(tmp),
                    "output_path": str(out),
                },
            )
            self.assertFalse(out.exists())
            self.assertTrue(removed)

    def test_test_without_output_dir_marks_model_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            model = Path(tmp) / "model"
            model.mkdir()
            (model / "partial_metrics.json").write_text("{}", encoding="utf-8")
            removed = cleanup_partial_artifacts(
                "test",
                {
                    "model_dir": str(model),
                    "data_dir": str(tmp),
                },
            )
            marker = model / ".orcai-desktop-incomplete-test"
            self.assertTrue(marker.is_file())
            self.assertEqual(removed, [str(marker.resolve())])

    def test_test_with_output_dir_marks_output_not_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            model = Path(tmp) / "model"
            model.mkdir()
            out = Path(tmp) / "eval-out"
            out.mkdir()
            removed = cleanup_partial_artifacts(
                "test",
                {
                    "model_dir": str(model),
                    "data_dir": str(tmp),
                    "output_dir": str(out),
                },
            )
            self.assertTrue((out / ".orcai-desktop-incomplete-test").is_file())
            self.assertFalse((model / ".orcai-desktop-incomplete-test").exists())
            self.assertTrue(removed)


# ---------------------------------------------------------------------------
# Messenger progress (п.3, п.5)
# ---------------------------------------------------------------------------


class MessengerProgressTests(_JobsFixture):
    def test_percent_and_epoch_update_progress(self) -> None:
        job = create_job("predict", {"recording_path": "/a.wav"})
        msgr = JobMessenger(job.id, verbosity=2, title=None)
        # Avoid Messenger.start side effects overwriting — call print directly.
        msgr.print("Training 40%")
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertAlmostEqual(refreshed.progress or 0.0, 0.4, places=2)
        self.assertTrue(any("40%" in ln for ln in refreshed.log))

        msgr.print("epoch 3 / 10")
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertAlmostEqual(refreshed.progress or 0.0, 0.3, places=2)

    def test_verbosity_filters_debug(self) -> None:
        job = create_job("predict", {"recording_path": "/a.wav"})
        msgr = JobMessenger(job.id, verbosity=1, title=None)
        before = len(get_job(job.id).log)  # type: ignore[union-attr]
        msgr.print("secret", severity=3)
        after = get_job(job.id)
        assert after is not None
        self.assertEqual(len(after.log), before)

    def test_message_to_line_variants(self) -> None:
        self.assertEqual(JobMessenger._message_to_line("a", ""), "a")
        self.assertIn("1", JobMessenger._message_to_line({"k": 1}, ""))
        self.assertIn("a", JobMessenger._message_to_line(["a", "b"], ""))


# ---------------------------------------------------------------------------
# Jobs contract fields (п.2, п.5, п.7)
# ---------------------------------------------------------------------------


class JobsContractFullTests(_JobsFixture):
    def test_failed_sets_exit_code_1(self) -> None:
        job = create_job("predict", {"recording_path": "/a.wav"})
        set_status(job.id, JobStatus.FAILED, error="boom")
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.exit_code, 1)
        self.assertEqual(refreshed.error, "boom")

    def test_retry_of_field(self) -> None:
        job = create_job(
            "predict",
            {"recording_path": "/a.wav"},
            retry_of="parent-id",
            priority=5,
        )
        d = job_to_dict(job)
        self.assertEqual(d["retry_of"], "parent-id")
        self.assertEqual(d["priority"], 5)

    def test_append_log_and_progress_publish(self) -> None:
        job = create_job("init", {"project_dir": "/p", "project_name": "p"})
        q = subscribe(job.id, maxsize=16)
        try:
            append_log(job.id, "line-a")
            set_progress(job.id, 0.55)
            got_types = set()
            deadline = time.time() + 1.0
            while time.time() < deadline and len(got_types) < 2:
                try:
                    item = q.get(timeout=0.2)
                except queue.Empty:
                    continue
                if isinstance(item, dict):
                    got_types.add(item.get("type"))
            self.assertIn("log", got_types)
            self.assertIn("progress", got_types)
        finally:
            unsubscribe(job.id, q)

    def test_cancel_train_marks_incomplete(self) -> None:
        out = self._home / "train-out"
        out.mkdir()
        (out / "partial.bin").write_bytes(b"x")
        job = create_job(
            "train",
            {
                "data_dir": str(self._home / "data"),
                "output_dir": str(out),
                "orcai_parameter": str(self._home / "p.json"),
            },
        )
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        marker = out / ".orcai-desktop-incomplete-train"
        self.assertTrue(marker.is_file())
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.exit_code, 130)

    def test_cancel_cleans_after_worker_stop(self) -> None:
        """Cleanup must run only after terminate/wait (NFR-6 race)."""
        order: list[str] = []
        label = self._home / "rec_predicted.txt"
        label.write_text("partial", encoding="utf-8")
        wav = self._home / "rec.wav"
        wav.write_bytes(b"RIFF")

        def fake_terminate(job_id: str) -> bool:
            order.append("terminate")
            return True

        def fake_wait(job_id: str, *, timeout: float = 2.0) -> bool:
            order.append("wait")
            return True

        def fake_cleanup(command: str, params: dict, **_kw) -> list[str]:
            order.append("cleanup")
            if label.exists():
                label.unlink()
                return [str(label.resolve())]
            return []

        job = create_job(
            "predict",
            {"recording_path": str(wav), "output_path": str(label)},
        )
        set_status(job.id, JobStatus.RUNNING)
        with (
            patch(
                "orcai_desktop_sidecar.job_cancel.terminate_worker",
                side_effect=fake_terminate,
            ),
            patch(
                "orcai_desktop_sidecar.job_cancel.wait_worker_stopped",
                side_effect=fake_wait,
            ),
            patch(
                "orcai_desktop_sidecar.cancel_cleanup.cleanup_partial_artifacts",
                side_effect=fake_cleanup,
            ),
        ):
            cancel_job(job.id)

        self.assertGreaterEqual(order.count("cleanup"), 2)
        self.assertEqual(order[0], "terminate")
        self.assertEqual(order[1], "wait")
        self.assertTrue(order.index("cleanup") > order.index("wait"))
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.CANCELLED)
        self.assertEqual(refreshed.exit_code, 130)

    def test_cancel_init_marks_incomplete(self) -> None:
        proj = self._home / "init-proj"
        proj.mkdir()
        param = proj / "demo_orcai_parameter.json"
        param.write_text("{}", encoding="utf-8")
        job = create_job(
            "init",
            {"project_dir": str(proj), "project_name": "demo"},
        )
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        self.assertTrue((proj / ".orcai-desktop-incomplete-init").is_file())
        self.assertFalse(param.exists())

    def test_cancel_test_without_output_marks_model_dir(self) -> None:
        model = self._home / "model-under-test"
        model.mkdir()
        (model / "weights.keras").write_bytes(b"x")
        job = create_job(
            "test",
            {
                "model_dir": str(model),
                "data_dir": str(self._home / "data"),
            },
        )
        set_status(job.id, JobStatus.RUNNING)
        cancel_job(job.id)
        self.assertTrue((model / ".orcai-desktop-incomplete-test").is_file())
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.exit_code, 130)
        self.assertTrue(refreshed.result and refreshed.result.get("incomplete"))


# ---------------------------------------------------------------------------
# Runner run_job (п.1-7 integration at handler layer)
# ---------------------------------------------------------------------------


class RunnerJobTests(_JobsFixture):
    def test_run_job_completes_with_cli_params(self) -> None:
        created = self._home / "artifact.txt"
        created.write_text("ok", encoding="utf-8")

        def handler(job_id: str, params: dict) -> dict:
            return {
                "created_files": [str(created)],
                "cli_params": {
                    "recording_path": str(params.get("recording_path")),
                    "channel": 2,
                },
            }

        job = create_job("predict", {"recording_path": str(self._home / "a.wav")})
        with patch.dict(
            "orcai_desktop_sidecar.runner._HANDLERS",
            {"predict": handler},
            clear=False,
        ):
            run_job(job.id, "predict", job.params)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.COMPLETED)
        self.assertEqual(refreshed.exit_code, 0)
        self.assertEqual(refreshed.artifacts, [str(created.resolve())])
        assert refreshed.command_line is not None
        self.assertIn("-c", refreshed.command_line)
        self.assertIn("2", refreshed.command_line)

    def test_run_job_unknown_command_fails(self) -> None:
        job = create_job("predict", {"recording_path": "/a.wav"})
        run_job(job.id, "not-a-real-command", {})
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.FAILED)
        self.assertEqual(refreshed.exit_code, 1)

    def test_run_job_handler_exception_preserves_message(self) -> None:
        def boom(job_id: str, params: dict) -> dict:
            raise RuntimeError("engine says no")

        job = create_job("predict", {"recording_path": "/a.wav"})
        with patch.dict(
            "orcai_desktop_sidecar.runner._HANDLERS",
            {"predict": boom},
            clear=False,
        ):
            run_job(job.id, "predict", job.params)
        refreshed = get_job(job.id)
        assert refreshed is not None
        self.assertEqual(refreshed.status, JobStatus.FAILED)
        self.assertEqual(refreshed.error, "engine says no")


# ---------------------------------------------------------------------------
# HTTP API surface (п.2-5) — direct route calls (no httpx/TestClient)
# ---------------------------------------------------------------------------


class ApiContractTests(_JobsFixture):
    def setUp(self) -> None:
        super().setUp()
        os.environ["ORCAI_FORCE_INPROCESS_JOBS"] = "1"
        import orcai_desktop_sidecar.job_queue as jq

        jq._scheduler = JobScheduler(max_concurrent=1)

    def test_create_queue_log_retry_404(self) -> None:
        from fastapi import HTTPException

        from orcai_desktop_sidecar.main import (
            CreateJobRequest,
            jobs_create,
            jobs_get,
            jobs_log_since,
            jobs_queue_status,
            jobs_retry,
        )

        artifact = self._home / "done.txt"
        artifact.write_text("ok", encoding="utf-8")

        def handler(job_id: str, params: dict) -> dict:
            append_log(job_id, "work-line")
            return {"created_files": [str(artifact.resolve())]}

        with patch.dict(
            "orcai_desktop_sidecar.runner._HANDLERS",
            {"init": handler},
            clear=False,
        ), patch("orcai_desktop_sidecar.main.orcai_available", return_value=True):
            body = jobs_create(
                CreateJobRequest(
                    command="init",
                    params={
                        "project_dir": str(self._home / "p"),
                        "project_name": "p",
                    },
                    priority=3,
                )
            )
            jid = body["id"]
            self.assertIn("orcai init", body.get("command_line") or "")
            self.assertEqual(body.get("priority"), 3)

            final = None
            for _ in range(80):
                final = jobs_get(jid)
                if final["status"] in ("completed", "failed", "cancelled"):
                    break
                time.sleep(0.05)
            assert final is not None
            self.assertEqual(final["status"], "completed", final)
            self.assertEqual(final["exit_code"], 0)
            self.assertTrue(
                all(Path(p).is_absolute() for p in (final.get("artifacts") or []))
            )

            log = jobs_log_since(jid, since=0)
            self.assertIn("lines", log)
            self.assertGreaterEqual(log["next_since"], 1)
            self.assertTrue(any("work-line" in ln for ln in log["lines"]))

            q = jobs_queue_status()
            self.assertEqual(q["max_concurrent"], 1)

            retry = jobs_retry(jid)
            self.assertEqual(retry["retry_of"], jid)

            with self.assertRaises(HTTPException) as ctx:
                jobs_get("does-not-exist-p14")
            self.assertEqual(ctx.exception.status_code, 404)

    def test_sse_replay_after_completion(self) -> None:
        import asyncio

        from orcai_desktop_sidecar.main import CreateJobRequest, jobs_create, jobs_events

        artifact = self._home / "sse.txt"
        artifact.write_text("ok", encoding="utf-8")

        def handler(job_id: str, params: dict) -> dict:
            append_log(job_id, "sse-line")
            return {"created_files": [str(artifact.resolve())]}

        with patch.dict(
            "orcai_desktop_sidecar.runner._HANDLERS",
            {"init": handler},
            clear=False,
        ), patch("orcai_desktop_sidecar.main.orcai_available", return_value=True):
            body = jobs_create(
                CreateJobRequest(
                    command="init",
                    params={
                        "project_dir": str(self._home / "sse"),
                        "project_name": "sse",
                    },
                )
            )
            jid = body["id"]
            for _ in range(80):
                job = get_job(jid)
                if job and job.status in (
                    JobStatus.COMPLETED,
                    JobStatus.FAILED,
                    JobStatus.CANCELLED,
                ):
                    break
                time.sleep(0.05)

            async def _collect() -> str:
                response = await jobs_events(jid, since=0)
                self.assertEqual(response.media_type, "text/event-stream")
                chunks: list[str] = []
                async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                    if isinstance(chunk, bytes):
                        chunks.append(chunk.decode("utf-8", errors="replace"))
                    else:
                        chunks.append(str(chunk))
                    joined = "".join(chunks)
                    if "snapshot" in joined:
                        break
                    if len(chunks) > 40:
                        break
                return "".join(chunks)

            text = asyncio.run(_collect())
            self.assertIn("snapshot", text)
            self.assertTrue(
                "sse-line" in text or "event: log" in text,
                msg=text[:500],
            )

    def test_capabilities_lists_twelve(self) -> None:
        from orcai_desktop_sidecar.main import capabilities

        with patch("orcai_desktop_sidecar.main.orcai_available", return_value=True):
            data = capabilities()
        listed = set(data.get("implemented_commands") or [])
        for cmd in TWELVE:
            self.assertIn(cmd, listed)


if __name__ == "__main__":
    unittest.main()
