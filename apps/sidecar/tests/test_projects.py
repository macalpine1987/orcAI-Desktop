"""Unit tests for project registry and file operations."""

from __future__ import annotations

import json
import shutil
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from orcai_desktop_sidecar.project_registry import (
    ProjectNameConflictError,
    check_project_name_available,
    compute_project_summary,
    create_project,
    delete_project,
    delete_recordings,
    discover_recording_table_paths,
    get_project,
    import_recordings,
    list_projects,
    recording_table_path,
    recordings_dir,
    register_existing_project,
    remove_project_recording_tables,
    slugify,
    sync_table_job_params,
    update_project,
)
from orcai_desktop_sidecar.store import connect, get_project_row


def _write_pcm16_wav(path: Path, *, frames: int = 800, sample_rate: int = 48_000) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * frames, *([0] * frames)))


def _require_soundfile() -> None:
    try:
        import soundfile  # noqa: F401
    except ImportError as exc:
        raise unittest.SkipTest("soundfile not installed") from exc


class ProjectRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._home = Path(self._tmp.name)
        self._patch = patch("orcai_desktop_sidecar.store._APP_DIR", self._home)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_slugify(self) -> None:
        self.assertEqual(slugify("My Field Study"), "my_field_study")
        self.assertEqual(slugify("  "), "project")

    def test_create_and_list_project(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(
            parent_dir=str(parent),
            display_name="Test Study",
            description="Field recordings 2024",
        )
        self.assertTrue(Path(created["path"]).is_dir())
        self.assertEqual(created["display_name"], "Test Study")
        self.assertEqual(created["description"], "Field recordings 2024")
        self.assertEqual(created["wav_count"], 0)
        self.assertFalse(created["initialized"])

        projects = list_projects()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["id"], created["id"])

    def test_create_training_project(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(
            parent_dir=str(parent),
            display_name="Train Study",
            description="Training pipeline",
            project_kind="training",
        )
        self.assertEqual(created["project_kind"], "training")
        fetched = get_project(created["id"])
        self.assertEqual(fetched["project_kind"], "training")

    def test_update_description(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="A", description="old")
        updated = update_project(created["id"], description="new text")
        self.assertEqual(updated["description"], "new text")
        manifest = Path(created["path"]) / "project.json"
        self.assertIn("new text", manifest.read_text(encoding="utf-8"))

    def test_auto_sync_recording_table_default_and_persist(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="AutoSync")
        self.assertTrue(created["auto_sync_recording_table"])
        settings_path = (
            Path(created["path"]) / ".orcai-desktop" / "desktop_settings.json"
        )
        # Default on: no settings file until the user changes the preference.
        self.assertFalse(settings_path.is_file())

        off = update_project(created["id"], auto_sync_recording_table=False)
        self.assertFalse(off["auto_sync_recording_table"])
        self.assertTrue(settings_path.is_file())
        disk = json.loads(settings_path.read_text(encoding="utf-8"))
        self.assertFalse(disk["auto_sync_recording_table"])

        again = get_project(created["id"])
        assert again is not None
        self.assertFalse(again["auto_sync_recording_table"])
        summary = compute_project_summary(created["id"])
        self.assertFalse(summary["auto_sync_recording_table"])

        on = update_project(created["id"], auto_sync_recording_table=True)
        self.assertTrue(on["auto_sync_recording_table"])

    def test_spectrogram_colormap_defaults_to_none_and_persists(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Cmap")
        self.assertIsNone(created.get("spectrogram_colormap"))
        settings_path = (
            Path(created["path"]) / ".orcai-desktop" / "desktop_settings.json"
        )
        self.assertFalse(settings_path.is_file())

        updated = update_project(created["id"], spectrogram_colormap="plasma")
        self.assertEqual(updated["spectrogram_colormap"], "plasma")
        disk = json.loads(settings_path.read_text(encoding="utf-8"))
        self.assertEqual(disk["spectrogram_colormap"], "plasma")

        again = get_project(created["id"])
        assert again is not None
        self.assertEqual(again["spectrogram_colormap"], "plasma")

        with self.assertRaises(ValueError):
            update_project(created["id"], spectrogram_colormap="Grays")

    def test_predict_model_per_project_persist(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="ModelPick")
        self.assertIsNone(created.get("predict_model"))
        self.assertIsNone(created.get("predict_model_dir"))

        updated = update_project(
            created["id"],
            predict_model="orcai-nor-v1",
            predict_model_dir=None,
        )
        self.assertEqual(updated["predict_model"], "orcai-nor-v1")
        self.assertIsNone(updated.get("predict_model_dir"))
        settings_path = (
            Path(created["path"]) / ".orcai-desktop" / "desktop_settings.json"
        )
        disk = json.loads(settings_path.read_text(encoding="utf-8"))
        self.assertEqual(disk["predict_model"], "orcai-nor-v1")
        self.assertNotIn("predict_model_dir", disk)

        trained = update_project(
            created["id"],
            predict_model="trained-1",
            predict_model_dir="/tmp/models/trained-1",
        )
        self.assertEqual(trained["predict_model"], "trained-1")
        self.assertEqual(trained["predict_model_dir"], "/tmp/models/trained-1")
        summary = compute_project_summary(created["id"])
        self.assertEqual(summary["predict_model"], "trained-1")
        self.assertEqual(summary["predict_model_dir"], "/tmp/models/trained-1")

        other = create_project(parent_dir=str(parent), display_name="Other")
        self.assertIsNone(other.get("predict_model"))

        dir_only = update_project(
            created["id"],
            predict_model_dir="/tmp/models/trained-1-relocated",
        )
        self.assertEqual(dir_only["predict_model"], "trained-1")
        self.assertEqual(dir_only["predict_model_dir"], "/tmp/models/trained-1-relocated")

    def test_delete_multiple_recordings(self) -> None:
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Multi Delete")
        paths = []
        for i in range(3):
            src = self._home / f"src_{i}.wav"
            _write_pcm16_wav(src)
            paths.append(str(src))
        imported = import_recordings(created["id"], paths)
        names = [item["name"] for item in imported]

        result = delete_recordings(created["id"], filenames=names[:2])
        self.assertEqual(result["count"], 2)
        refreshed = get_project(created["id"])
        assert refreshed is not None
        self.assertEqual(refreshed["wav_count"], 1)

    def test_delete_recordings_by_stem_like_ui(self) -> None:
        """Projects UI selects CSV/table stems (no .wav); delete must still unlink files."""
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Stem Delete")
        rec = recordings_dir(Path(created["path"]))
        rec.mkdir(parents=True, exist_ok=True)
        stems = ["field_0", "field_1", "field_2"]
        for stem in stems:
            _write_pcm16_wav(rec / f"{stem}.wav")

        # Select-all style: every stem (as Projects table / UI selection does)
        result = delete_recordings(created["id"], filenames=stems)
        self.assertEqual(result["count"], 3)
        self.assertNotIn("skipped", result)
        self.assertEqual(len(list(rec.glob("*.wav"))), 0)
        refreshed = get_project(created["id"])
        assert refreshed is not None
        self.assertEqual(refreshed["wav_count"], 0)

        # Single stem after re-adding one file
        _write_pcm16_wav(rec / "solo.wav")
        one = delete_recordings(created["id"], filenames=["solo"])
        self.assertEqual(one["count"], 1)
        self.assertEqual(len(list(rec.glob("*.wav"))), 0)

    def test_import_and_delete_recordings(self) -> None:
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        src = self._home / "source.wav"
        _write_pcm16_wav(src)

        created = create_project(parent_dir=str(parent), display_name="Import Test")
        imported = import_recordings(created["id"], [str(src)])
        self.assertEqual(len(imported), 1)
        self.assertTrue(Path(imported[0]["dest"]).is_file())

        refreshed = get_project(created["id"])
        assert refreshed is not None
        self.assertEqual(refreshed["wav_count"], 1)

        result = delete_recordings(created["id"], filenames=[imported[0]["name"]])
        self.assertEqual(result["count"], 1)
        again = get_project(created["id"])
        assert again is not None
        self.assertEqual(again["wav_count"], 0)

    def test_import_recordings_sorted_by_filename(self) -> None:
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Import Sort")
        paths: list[str] = []
        for name in ("c.wav", "a.wav", "B.wav"):
            src = self._home / name
            _write_pcm16_wav(src)
            paths.append(str(src))
        imported = import_recordings(created["id"], paths)
        self.assertEqual([item["name"] for item in imported], ["a.wav", "B.wav", "c.wav"])

    def test_sync_table_job_params_modes(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Table Sync")
        project_dir = Path(created["path"])
        table = recording_table_path(project_dir)
        table.write_text("index,col\n0,a\n", encoding="utf-8")

        merge = sync_table_job_params(created["id"], overwrite=False, update_table=True)
        self.assertFalse(merge["overwrite"])
        self.assertEqual(merge["update_table"], str(table))

        rebuild = sync_table_job_params(created["id"], overwrite=True, update_table=False)
        self.assertTrue(rebuild["overwrite"])
        self.assertNotIn("update_table", rebuild)

        create_params = sync_table_job_params(
            created["id"], overwrite=False, update_table=False
        )
        self.assertFalse(create_params["overwrite"])
        self.assertNotIn("update_table", create_params)

    def test_delete_all_recordings_removes_table(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Clear Test")
        project_dir = Path(created["path"])
        (project_dir / "recording_table.csv").write_text("index,col\n0,a\n", encoding="utf-8")
        _require_soundfile()
        wav = project_dir / "recordings" / "a.wav"
        wav.parent.mkdir(exist_ok=True)
        _write_pcm16_wav(wav, frames=400)

        result = delete_recordings(created["id"], delete_all=True)
        self.assertFalse((project_dir / "recording_table.csv").exists())
        self.assertEqual(len(list((project_dir / "recordings").glob("*.wav"))), 0)
        self.assertIn(str(project_dir / "recording_table.csv"), result.get("removed_tables", []))

    def test_delete_last_recording_removes_legacy_table(self) -> None:
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Last WAV")
        project_dir = Path(created["path"])
        src = self._home / "one.wav"
        _write_pcm16_wav(src)
        imported = import_recordings(created["id"], [str(src)])
        legacy = recordings_dir(project_dir) / "recording_table.csv"
        legacy.write_text("index,col\n0,a\n", encoding="utf-8")

        delete_recordings(created["id"], filenames=[imported[0]["name"]])
        self.assertFalse(legacy.exists())
        refreshed = get_project(created["id"])
        assert refreshed is not None
        self.assertEqual(refreshed["wav_count"], 0)

    def test_discover_recording_tables(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Discover")
        project_dir = Path(created["path"])
        canonical = recording_table_path(project_dir)
        canonical.write_text("a\n", encoding="utf-8")
        legacy = recordings_dir(project_dir) / "recording_table.csv"
        legacy.parent.mkdir(exist_ok=True)
        legacy.write_text("b\n", encoding="utf-8")

        paths = discover_recording_table_paths(project_dir)
        self.assertEqual(len(paths), 2)
        removed = remove_project_recording_tables(project_dir)
        self.assertEqual(len(removed), 2)
        self.assertFalse(canonical.exists())
        self.assertFalse(legacy.exists())

    def test_register_existing_folder(self) -> None:
        folder = self._home / "legacy_project"
        folder.mkdir()
        (folder / "recordings").mkdir()
        registered = register_existing_project(str(folder), display_name="Legacy")
        self.assertEqual(registered["display_name"], "Legacy")
        row = get_project_row(connect(), registered["id"])
        assert row is not None

    def test_register_existing_idempotent_same_path(self) -> None:
        folder = self._home / "usb_project"
        folder.mkdir()
        (folder / "recordings").mkdir()
        first = register_existing_project(str(folder), display_name="USB Copy")
        second = register_existing_project(str(folder))
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["path"], second["path"])

    def test_register_existing_disambiguates_display_name(self) -> None:
        parent = self._home / "field"
        parent.mkdir()
        create_project(parent_dir=str(parent), display_name="Fjord")
        copy = parent / "Fjord-USB"
        copy.mkdir()
        (copy / "recordings").mkdir()
        (copy / "predict_orcai_parameter.json").write_text("{}", encoding="utf-8")
        registered = register_existing_project(str(copy), display_name="Fjord")
        self.assertNotEqual(registered["display_name"].casefold(), "fjord")
        self.assertIn("Fjord", registered["display_name"])
        self.assertTrue(Path(registered["path"]).is_dir())
        self.assertIsNotNone(get_project(registered["id"]))

    def test_delete_project_registry_only(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="ToRemove")
        path = Path(created["path"])
        delete_project(created["id"], delete_files=False)
        self.assertTrue(path.is_dir())
        self.assertIsNone(get_project(created["id"]))

    def test_delete_project_clears_predict_jobs(self) -> None:
        from orcai_desktop_sidecar import jobs as jobs_mod
        from orcai_desktop_sidecar.jobs import create_job, list_jobs

        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Gone")
        path = created["path"]
        jobs_mod._bootstrapped = False
        jobs_mod._jobs.clear()
        create_job(
            "predict",
            {"project_dir": path, "threshold": 0.8, "recording_path": "/x.wav"},
        )
        self.assertTrue(any(j.params.get("project_dir") == path for j in list_jobs()))
        delete_project(created["id"], delete_files=True)
        leftover = [j for j in list_jobs() if j.params.get("project_dir") == path]
        self.assertEqual(leftover, [])

    def test_duplicate_display_name_rejected(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        create_project(parent_dir=str(parent), display_name="Field Study")

        check = check_project_name_available(str(parent), "field study")
        self.assertFalse(check["available"])
        self.assertTrue(
            any(c["reason"] == "display_name" for c in check["conflicts"]),
        )

        with self.assertRaises(ProjectNameConflictError):
            create_project(parent_dir=str(parent), display_name="Field Study")

    def test_duplicate_slug_rejected(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        create_project(parent_dir=str(parent), display_name="My Project")

        check = check_project_name_available(str(parent), "my-project")
        self.assertFalse(check["available"])

        with self.assertRaises(ProjectNameConflictError):
            create_project(parent_dir=str(parent), display_name="my-project")

    def test_update_display_name_conflict(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        a = create_project(parent_dir=str(parent), display_name="Alpha")
        create_project(parent_dir=str(parent), display_name="Beta")

        with self.assertRaises(ProjectNameConflictError):
            update_project(a["id"], display_name="beta")

    def test_delete_project_with_files(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Gone")
        path = Path(created["path"])
        delete_project(created["id"], delete_files=True)
        self.assertFalse(path.exists())

    def test_list_prunes_missing_disk_folder(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Ghost")
        path = Path(created["path"])
        project_id = created["id"]
        shutil.rmtree(path)
        self.assertEqual(list_projects(), [])
        self.assertIsNone(get_project_row(connect(), project_id))

    def test_get_project_prunes_missing_disk_folder(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="GhostGet")
        path = Path(created["path"])
        project_id = created["id"]
        shutil.rmtree(path)
        self.assertIsNone(get_project(project_id))
        self.assertIsNone(get_project_row(connect(), project_id))

    def test_usb_unplug_prunes_registry_row(self) -> None:
        """Missing folder (incl. unplugged volume) is removed from SQLite automatically."""
        volume = self._home / "Volumes" / "USBStick"
        volume.mkdir(parents=True)
        created = create_project(parent_dir=str(volume), display_name="FieldUSB")
        project_id = created["id"]
        shutil.rmtree(self._home / "Volumes")
        self.assertEqual(list_projects(), [])
        self.assertIsNone(get_project(project_id))
        self.assertIsNone(get_project_row(connect(), project_id))

    def test_register_keeps_display_name_when_slug_collides(self) -> None:
        """P-05: display label free even if another folder's slug matches the name."""
        parent = self._home / "workspace"
        parent.mkdir()
        create_project(parent_dir=str(parent), display_name="Alpha")
        clash_dir = parent / "field_study"
        clash_dir.mkdir()
        (clash_dir / "recordings").mkdir()
        register_existing_project(str(clash_dir), display_name="Other Label")
        usb = parent / "usb_fjord"
        usb.mkdir()
        (usb / "recordings").mkdir()
        registered = register_existing_project(str(usb), display_name="Field Study")
        self.assertEqual(registered["display_name"], "Field Study")

    def test_register_does_not_rewrite_existing_manifest_id(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        first = create_project(parent_dir=str(parent), display_name="Original")
        first_id = first["id"]
        copy = parent / "usb_copy"
        copy.mkdir()
        (copy / "recordings").mkdir()
        (copy / "project.json").write_text(
            json.dumps(
                {
                    "id": first_id,
                    "display_name": "USB Copy",
                    "orcai_name": "usb_copy",
                    "path": str(copy),
                    "created_at": 1.0,
                    "updated_at": 1.0,
                }
            ),
            encoding="utf-8",
        )
        registered = register_existing_project(str(copy))
        self.assertNotEqual(registered["id"], first_id)
        disk = json.loads((copy / "project.json").read_text(encoding="utf-8"))
        self.assertEqual(disk["id"], first_id)

    def test_check_name_suggests_register_for_orphan_dir(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        orphan = parent / "orphan_proj"
        orphan.mkdir()
        (orphan / "recordings").mkdir()
        check = check_project_name_available(str(parent), "orphan proj")
        self.assertFalse(check["available"])
        self.assertTrue(
            any(c.get("suggest_register") for c in check["conflicts"]),
        )

    def test_multiple_parameter_files_prefer_folder_name(self) -> None:
        folder = self._home / "my_cli"
        folder.mkdir()
        (folder / "recordings").mkdir()
        (folder / "my_cli_orcai_parameter.json").write_text("{}", encoding="utf-8")
        (folder / "other_orcai_parameter.json").write_text("{}", encoding="utf-8")
        registered = register_existing_project(str(folder))
        self.assertEqual(registered["orcai_name"], "my_cli")

    def test_multiple_parameter_files_ambiguous_raises(self) -> None:
        folder = self._home / "ambiguous"
        folder.mkdir()
        (folder / "recordings").mkdir()
        (folder / "alpha_orcai_parameter.json").write_text("{}", encoding="utf-8")
        (folder / "beta_orcai_parameter.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(ValueError):
            register_existing_project(str(folder))

    def test_focus_travels_via_desktop_meta_file(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(
            parent_dir=str(parent),
            display_name="FocusUSB",
            focus="training",
        )
        focus_file = Path(created["path"]) / ".orcai-desktop" / "desktop_focus.json"
        self.assertTrue(focus_file.is_file())
        delete_project(created["id"], delete_files=False)
        again = register_existing_project(str(created["path"]))
        self.assertEqual(again["focus"], "training")
        self.assertEqual(again["focus_source"], "stored")

    def test_register_existing_name_conflict(self) -> None:
        """Same display name under one parent → register still succeeds with a unique label."""
        parent = self._home / "workspace"
        parent.mkdir()
        create_project(parent_dir=str(parent), display_name="Alpha")
        sibling = parent / "legacy_site"
        sibling.mkdir()
        (sibling / "recordings").mkdir()
        registered = register_existing_project(str(sibling), display_name="Alpha")
        self.assertEqual(Path(registered["path"]).name, "legacy_site")
        self.assertNotEqual(registered["display_name"].casefold(), "alpha")

    def test_list_survives_non_object_manifest(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Ok")
        bad = create_project(parent_dir=str(parent), display_name="Broken")
        (Path(bad["path"]) / "project.json").write_text("[]\n", encoding="utf-8")
        listed = list_projects()
        ids = {p["id"] for p in listed}
        self.assertIn(created["id"], ids)
        self.assertIn(bad["id"], ids)
        broken = next(p for p in listed if p["id"] == bad["id"])
        self.assertIsNone(broken["manifest"])

    def test_prune_when_path_is_file_not_dir(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Gone")
        path = Path(created["path"])
        shutil.rmtree(path)
        path.write_text("not a project\n", encoding="utf-8")
        listed = list_projects()
        self.assertNotIn(created["id"], {p["id"] for p in listed})
        self.assertIsNone(get_project(created["id"]))

    def test_register_does_not_steal_path_on_id_conflict(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        first = create_project(parent_dir=str(parent), display_name="First")
        first_path = first["path"]
        other = parent / "other"
        other.mkdir()
        (other / "recordings").mkdir()
        (other / "project.json").write_text(
            json.dumps(
                {
                    "id": first["id"],
                    "display_name": "Other",
                    "orcai_name": "other",
                    "path": str(other),
                    "created_at": 1.0,
                    "updated_at": 1.0,
                }
            ),
            encoding="utf-8",
        )
        registered = register_existing_project(str(other))
        self.assertNotEqual(registered["id"], first["id"])
        self.assertEqual(Path(registered["path"]).resolve(), other.resolve())
        still = get_project(first["id"])
        assert still is not None
        self.assertEqual(Path(still["path"]).resolve(), Path(first_path).resolve())

    def test_desktop_focus_file_overrides_sqlite(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(
            parent_dir=str(parent),
            display_name="FocusFile",
            focus="recognition",
        )
        focus_file = Path(created["path"]) / ".orcai-desktop" / "desktop_focus.json"
        focus_file.write_text(
            json.dumps({"focus": "training"}, indent=2) + "\n",
            encoding="utf-8",
        )
        refreshed = get_project(created["id"])
        assert refreshed is not None
        self.assertEqual(refreshed["focus"], "training")

    def test_update_display_name_keeps_folder(self) -> None:
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Alpha")
        updated = update_project(created["id"], display_name="Beta Renamed")
        self.assertEqual(updated["display_name"], "Beta Renamed")
        self.assertEqual(Path(updated["path"]).name, "alpha")
        self.assertEqual(updated["orcai_name"], "alpha")

    def test_compute_project_summary_counts_and_readiness(self) -> None:
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="Summary")
        project_dir = Path(created["path"])
        rec = recordings_dir(project_dir)
        wav = rec / "clip_a.wav"
        _write_pcm16_wav(wav)
        ann = project_dir / "annotations"
        ann.mkdir(exist_ok=True)
        (ann / "clip_a.txt").write_text("0.0 1.0 WHISTLE\n", encoding="utf-8")
        (ann / "clip_a_orcai-nor-v1_predicted.txt").write_text(
            "0.0 1.0 WHISTLE\n",
            encoding="utf-8",
        )

        summary = compute_project_summary(created["id"])
        self.assertEqual(summary["metrics"]["recordings"], 1)
        self.assertEqual(summary["metrics"]["annotations"], 1)
        self.assertEqual(summary["metrics"]["predicted"], 1)
        self.assertEqual(summary["recording_table"]["sync_status"], "missing")
        self.assertEqual(summary["readiness"]["recordings"], "needed")
        self.assertEqual(summary["readiness"]["predict"], "ready")
        self.assertIn("readiness_lines", summary)
        self.assertIn("next_actions", summary)

    def test_compute_project_summary_datasets_needed_from_annotations(self) -> None:
        """BUG-P-06: create_tvt readiness from annotations, not only after predict."""
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="DatasetsAnn")
        project_dir = Path(created["path"])
        rec = recordings_dir(project_dir)
        wav = rec / "clip_a.wav"
        _write_pcm16_wav(wav)
        ann = project_dir / "annotations"
        ann.mkdir(exist_ok=True)
        (ann / "clip_a.txt").write_text("0.0 1.0 WHISTLE\n", encoding="utf-8")

        summary = compute_project_summary(created["id"])
        self.assertEqual(summary["metrics"]["annotations"], 1)
        self.assertEqual(summary["metrics"]["predicted"], 0)
        self.assertEqual(summary["readiness"]["datasets"], "needed")
        self.assertEqual(summary["readiness"]["annotations"], "ready")
        self.assertIn("create_tvt", summary["next_actions"])
        self.assertEqual(summary["readiness_lines"]["annotations"]["paired_files"], 1)

    def test_paired_files_ignore_csv_path_and_survive_hidden_parent(self) -> None:
        """Wizard gate counts .txt on disk, including when the project sits under a dot-dir."""
        parent = self._home / ".secret"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="HiddenParent")
        project_dir = Path(created["path"])
        rec = recordings_dir(project_dir)
        _write_pcm16_wav(rec / "clip_a.wav")
        table = recording_table_path(project_dir)
        table.write_text(
            "recording,rel_annotation_path\nclip_a,clip_a.txt\n",
            encoding="utf-8",
        )
        bare = compute_project_summary(created["id"])
        self.assertEqual(bare["readiness_lines"]["annotations"]["paired_files"], 0)

        ann = project_dir / "annotations"
        ann.mkdir(exist_ok=True)
        (ann / "clip_a_predicted.txt").write_text("0.0 1.0 WHISTLE\n", encoding="utf-8")
        (ann / "nested" / "clip_a.txt").parent.mkdir()
        (ann / "nested" / "clip_a.txt").write_text("0.0 1.0 WHISTLE\n", encoding="utf-8")
        paired = compute_project_summary(created["id"])
        self.assertEqual(paired["readiness_lines"]["annotations"]["paired_files"], 1)
        self.assertEqual(paired["metrics"]["annotations"], 1)
        self.assertEqual(paired["metrics"]["predicted"], 1)

    def test_compute_project_summary_recording_table_sync_states(self) -> None:
        """B-02: recording_table sync_status missing | stale | current."""
        _require_soundfile()
        parent = self._home / "workspace"
        parent.mkdir()
        created = create_project(parent_dir=str(parent), display_name="SyncStates")
        project_dir = Path(created["path"])
        rec = recordings_dir(project_dir)
        wav = rec / "clip_a.wav"
        _write_pcm16_wav(wav)

        missing = compute_project_summary(created["id"])
        self.assertEqual(missing["recording_table"]["sync_status"], "missing")

        table = recording_table_path(project_dir)
        # One row matching the single WAV → current (when mtime is not newer).
        table.write_text(
            "recording,channel,rel_recording_path,rel_annotation_path\n"
            "clip_a,1,recordings/clip_a.wav,\n",
            encoding="utf-8",
        )
        # Ensure table mtime is at least as new as the wav.
        import os
        import time

        now = time.time()
        os.utime(wav, (now - 10, now - 10))
        os.utime(table, (now, now))
        current = compute_project_summary(created["id"])
        self.assertEqual(current["recording_table"]["sync_status"], "current")
        self.assertEqual(current["metrics"]["recordings"], 1)

        # Row count mismatch → stale.
        table.write_text(
            "recording,channel,rel_recording_path,rel_annotation_path\n"
            "clip_a,1,recordings/clip_a.wav,\n"
            "clip_b,1,recordings/clip_b.wav,\n",
            encoding="utf-8",
        )
        stale_rows = compute_project_summary(created["id"])
        self.assertEqual(stale_rows["recording_table"]["sync_status"], "stale")

        # Matching rows but WAV newer than table → stale.
        table.write_text(
            "recording,channel,rel_recording_path,rel_annotation_path\n"
            "clip_a,1,recordings/clip_a.wav,\n",
            encoding="utf-8",
        )
        older = time.time() - 30
        os.utime(table, (older, older))
        os.utime(wav, (time.time(), time.time()))
        stale_mtime = compute_project_summary(created["id"])
        self.assertEqual(stale_mtime["recording_table"]["sync_status"], "stale")

        # Matching rows but annotation .txt newer than table → stale (BUG-05).
        os.utime(wav, (older, older))
        os.utime(table, (older, older))
        ann = project_dir / "annotations"
        ann.mkdir(exist_ok=True)
        label = ann / "clip_a.txt"
        label.write_text("0.0\t1.0\tBR\n", encoding="utf-8")
        os.utime(label, (time.time(), time.time()))
        stale_ann = compute_project_summary(created["id"])
        self.assertEqual(stale_ann["recording_table"]["sync_status"], "stale")
        self.assertEqual(stale_ann["metrics"]["annotations"], 1)


if __name__ == "__main__":
    unittest.main()
