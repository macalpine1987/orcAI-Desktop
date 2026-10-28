"""Training pipeline board (FR-7.2): step state from the project directory."""

from __future__ import annotations

import contextlib
import csv
import gzip
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_registry import (
    annotations_dir,
    get_project,
    list_wav_files,
    recordings_dir,
    resolve_recording_table_path,
)
from orcai_desktop_sidecar.project_studio import (
    _dir_stats,
    _is_hidden,
    _parameter_calls,
    _read_json_file,
)
from orcai_desktop_sidecar.store import list_all_jobs, normalize_project_dir

TRAIN_STEP_IDS: tuple[str, ...] = (
    "create-spectrograms",
    "create-label-arrays",
    "create-snippet-table",
    "create-tvt-snippet-tables",
    "create-tvt-data",
    "hpsearch",
    "train",
    "test",
)

STATUS_IDLE = "idle"
STATUS_RUNNING = "running"
STATUS_QUEUED = "queued"
STATUS_DONE = "done"
STATUS_STALE = "stale"
STATUS_BLOCKED = "blocked"
STATUS_ERROR = "error"

_BUSY = frozenset({STATUS_BLOCKED, STATUS_RUNNING, STATUS_QUEUED})

# These steps read annotation .txt files. Spectrograms do not.
STEPS_NEEDING_ANNOTATION_TXT = frozenset(
    {
        "create-label-arrays",
        "create-snippet-table",
        "create-tvt-snippet-tables",
        "create-tvt-data",
        "hpsearch",
        "train",
        "test",
    }
)


def _resolve_call_equivalences_path(project_dir: Path) -> Path | None:
    """Wizard default ``call_equivalences.json`` (and common drop-in names)."""
    names = (
        "call_equivalences.json",
        "call_equivalence.json",
    )
    for name in names:
        path = project_dir / name
        if path.is_file():
            return path
    try:
        matches = sorted(
            (
                p
                for p in project_dir.glob("*call_equivalences*.json")
                if p.is_file() and not p.name.startswith(".")
            ),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        matches = []
    return matches[0] if matches else None


def _job_wants_unfiltered_test(job: dict[str, Any] | None) -> bool:
    if not job:
        return False
    params = job.get("params") if isinstance(job.get("params"), dict) else {}
    return bool(
        params.get("create_unfiltered_test_snippets")
        or params.get("test_unfiltered")
    )


def _want_unfiltered_test(
    tvt_dir: Path,
    latest: dict[str, dict[str, Any]],
) -> bool:
    """Mirror wizard ``testAfterTrain`` for board re-runs (-uts / -tu)."""
    if (tvt_dir / "test_unfiltered.csv.gz").is_file():
        return True
    if (tvt_dir / "test_unfiltered_dataset").exists():
        return True
    return _job_wants_unfiltered_test(
        latest.get("create-tvt-snippet-tables")
    ) or _job_wants_unfiltered_test(latest.get("test"))


def _resolve_finetune_load_model(
    latest: dict[str, dict[str, Any]],
) -> str | None:
    """Reuse ``-lmf`` from the latest project train job (wizard finetune)."""
    job = latest.get("train")
    if not job:
        return None
    params = job.get("params") if isinstance(job.get("params"), dict) else {}
    lmf = params.get("load_model_from")
    if isinstance(lmf, (str, Path)) and str(lmf).strip():
        return str(Path(str(lmf)).expanduser())
    lm = params.get("load_model")
    if isinstance(lm, str) and lm.strip() and lm.lower() not in ("true", "false", "1", "0"):
        return str(Path(lm).expanduser())
    return None


def _resolve_hps_parameter_path(
    project_dir: Path,
    parameter: dict[str, Any],
    orcai_name: str,
) -> Path | None:
    """Prefer project HPS written by the wizard; else None (orcAI default -hp)."""
    names: list[str] = []
    model_name = str(parameter.get("name") or "").strip()
    if model_name:
        safe = re.sub(r"[^\w.\-]+", "_", model_name) or "model"
        names.append(f"{safe}_hps_parameter.json")
    orcai = str(orcai_name or "").strip()
    if orcai:
        safe = re.sub(r"[^\w.\-]+", "_", orcai) or "model"
        names.append(f"{safe}_hps_parameter.json")
    names.append("hps_parameter.json")
    seen: set[str] = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        path = project_dir / name
        if path.is_file():
            return path
    # Newest *_hps_parameter.json in the project root (wizard / manual drop-in).
    try:
        matches = sorted(
            (
                p
                for p in project_dir.glob("*_hps_parameter.json")
                if p.is_file() and not p.name.startswith(".")
            ),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        matches = []
    return matches[0] if matches else None


def disk_readiness_state(
    *,
    free_bytes: int,
    needed_bytes: int,
    measured: bool,
) -> str:
    """Wizard / pipeline disk lamp: ``ok`` | ``warn`` | ``off``.

    - ``off`` — free space below the estimate (blocks wizard launch).
    - ``warn`` — free is under 1.4× needed, or disk usage could not be measured.
    - ``ok`` — enough headroom, or nothing extra is needed yet.
    """
    if needed_bytes <= 0:
        return "ok"
    if not measured:
        return "warn"
    if free_bytes < needed_bytes:
        return "off"
    if free_bytes < needed_bytes * 1.4:
        return "warn"
    return "ok"


# Rough TVT float-feature footprint per snippet (train/val/test shards).
_BYTES_PER_TVT_SNIPPET = 24_000
# Spectrograms + label arrays are typically larger than raw WAV.
_SPEC_LABEL_MULT = 2.0
# Checkpoint / history headroom before train finishes.
_MODEL_HEADROOM_BYTES = 512 * 1024 * 1024
# When WAV sizes are unknown, floor per recording for spec+labels.
_FALLBACK_PER_REC_BYTES = 80 * 1024 * 1024


def estimate_pipeline_disk_needed(
    *,
    wav_bytes: int,
    table_rows: int,
    spec_count: int,
    label_count: int,
    tvt_data_ready: bool,
    train_ready: bool,
    required_snippets: int,
    snippet_rows: int | None,
    n_batch_train: int,
    n_batch_val: int,
    n_batch_test: int,
    batch_size: int,
    snippet_duration: float = 4.0,
    snippets_per_sec: float = 3.0,
) -> int:
    """Estimate *additional* bytes the remaining pipeline steps still need.

    Used by the Обучение readiness lamp and wizard preflight. Prefer WAV size and
    ``n_batch_* × batch_size``; fall back to duration × snippets_per_sec so the
    UI never shows «нужно ~0 Б» while create-spectrograms / TVT / train remain.
    """
    needed = 0
    rows = max(0, int(table_rows))
    specs = max(0, int(spec_count))
    labels = max(0, int(label_count))
    wav = max(0, int(wav_bytes))

    if rows > 0:
        remaining_spec = max(0, rows - min(specs, rows))
        if remaining_spec > 0:
            if wav > 0:
                needed += int(wav * (remaining_spec / rows) * _SPEC_LABEL_MULT)
            else:
                needed += remaining_spec * _FALLBACK_PER_REC_BYTES
        elif labels < min(specs, rows):
            remaining_lab = max(0, min(specs, rows) - labels)
            if wav > 0:
                needed += int(wav * (remaining_lab / rows) * 0.5)
            else:
                needed += remaining_lab * (_FALLBACK_PER_REC_BYTES // 4)

    if not tvt_data_ready:
        snip = max(0, int(required_snippets))
        bs = max(0, int(batch_size))
        if bs > 0:
            batches = (
                max(0, int(n_batch_train))
                + max(0, int(n_batch_val))
                + max(0, int(n_batch_test))
            )
            if batches > 0:
                snip = max(snip, batches * bs)
        if snip <= 0 and snippet_rows:
            snip = max(0, int(snippet_rows))
        if snip <= 0:
            duration = float(snippet_duration) if snippet_duration > 0 else 4.0
            sps = float(snippets_per_sec) if snippets_per_sec > 0 else 3.0
            if wav > 0:
                # 16-bit mono @ 48 kHz ≈ 96 KiB/s
                approx_sec = wav / 96_000.0
                snip = int(max(1_000, approx_sec * sps * 0.5))
            else:
                n_ann = max(1, rows)
                snip = int(max(1_000, n_ann * duration * sps * 60))
        needed += snip * _BYTES_PER_TVT_SNIPPET

    if not train_ready:
        needed += _MODEL_HEADROOM_BYTES

    return int(needed)


_TVT_SPLITS = ("train", "val", "test")
_STALE_SPEC_STEPS = frozenset({"create-spectrograms", "create-label-arrays"})
_STALE_SNIPPET_STEPS = frozenset(
    {"create-snippet-table", "create-tvt-snippet-tables", "create-tvt-data"}
)
_PARAM_FPS_REL = Path(".orcai_desktop") / "pipeline_param_fps.json"


def _require_project(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    return project


def _mtime(path: Path | None) -> float | None:
    if path is None:
        return None
    try:
        return path.stat().st_mtime if path.exists() else None
    except OSError:
        return None


def _max_mtime(*values: float | None) -> float | None:
    present = [v for v in values if v is not None]
    return max(present) if present else None


def _newer(left: float | None, right: float | None) -> bool:
    return left is not None and right is not None and left > right + 0.5


def _int_param(section: dict[str, Any] | None, *keys: str, default: int = 0) -> int:
    if not isinstance(section, dict):
        return default
    for key in keys:
        raw = section.get(key)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            return int(raw)
        if isinstance(raw, str):
            try:
                return int(float(raw.strip().replace(",", ".")))
            except ValueError:
                continue
    return default


def _float_param(section: dict[str, Any] | None, *keys: str, default: float = 0.0) -> float:
    if not isinstance(section, dict):
        return default
    for key in keys:
        raw = section.get(key)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            return float(raw)
        if isinstance(raw, str):
            try:
                return float(raw.strip().replace(",", "."))
            except ValueError:
                continue
    return default


def _gzip_data_rows(path: Path) -> int | None:
    if not path.is_file():
        return None
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            if handle.readline() == "":
                return 0
            return sum(1 for _ in handle)
    except OSError:
        return None


def _snippet_rows_by_type(path: Path) -> dict[str, int]:
    """Raw row counts per data_type from all_snippets.csv.gz (stdlib only)."""
    if not path.is_file():
        return {}
    counts: dict[str, int] = {}
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                key = str(row.get("data_type") or "").strip() or "unknown"
                counts[key] = counts.get(key, 0) + 1
    except OSError:
        return {}
    return counts


def _table_row_count(table_path: Path | None) -> int:
    if table_path is None or not table_path.is_file():
        return 0
    try:
        with table_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            if next(reader, None) is None:
                return 0
            return sum(1 for _ in reader)
    except (OSError, csv.Error):
        return 0


def _stale_param_reason(step_id: str) -> str:
    if step_id in _STALE_SPEC_STEPS:
        return "params_changed_spectrogram"
    if step_id in _STALE_SNIPPET_STEPS:
        return "params_changed_snippets"
    return "params_changed"


def _param_slice_for_step(step_id: str, parameter: dict[str, Any]) -> dict[str, Any]:
    """Fields that actually affect a pipeline step's artifacts (FR-7.2)."""
    if step_id in _STALE_SPEC_STEPS:
        return {
            "spectrogram": parameter.get("spectrogram"),
            "calls": parameter.get("calls"),
        }
    if step_id in _STALE_SNIPPET_STEPS:
        return {
            "snippets": parameter.get("snippets"),
            "seed": parameter.get("seed"),
            "calls": parameter.get("calls"),
            "spectrogram": {
                "duration": (parameter.get("spectrogram") or {}).get("duration")
                if isinstance(parameter.get("spectrogram"), dict)
                else None,
            },
        }
    # hpsearch / train / test
    return {
        "name": parameter.get("name"),
        "architecture": parameter.get("architecture"),
        "model": parameter.get("model"),
        "seed": parameter.get("seed"),
        "calls": parameter.get("calls"),
    }


def _param_fingerprint(step_id: str, parameter: dict[str, Any]) -> str:
    payload = _param_slice_for_step(step_id, parameter)
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _param_fps_path(project_dir: Path) -> Path:
    return project_dir / _PARAM_FPS_REL


def _load_param_fps(project_dir: Path) -> dict[str, str]:
    path = _param_fps_path(project_dir)
    data = _read_json_file(path)
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, str) and key in TRAIN_STEP_IDS:
            out[key] = value
    return out


def _save_param_fps(project_dir: Path, fps: dict[str, str]) -> None:
    path = _param_fps_path(project_dir)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(fps, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError:
        return


def record_step_param_fingerprint(
    project_dir: Path,
    step_id: str,
    *,
    parameter: dict[str, Any] | None = None,
    orcai_parameter: str | Path | None = None,
) -> None:
    """Pin the step's relevant params after a successful run (so later edits can go stale)."""
    if step_id not in TRAIN_STEP_IDS:
        return
    project_dir = project_dir.expanduser().resolve()
    doc = parameter
    if doc is None and orcai_parameter is not None:
        doc = _read_json_file(Path(str(orcai_parameter)).expanduser())
    if not isinstance(doc, dict):
        return
    fps = _load_param_fps(project_dir)
    fps[step_id] = _param_fingerprint(step_id, doc)
    _save_param_fps(project_dir, fps)


def _params_make_step_stale(
    step_id: str,
    *,
    parameter: dict[str, Any],
    fps: dict[str, str],
    artifact_mtime: float | None,
    param_mtime: float | None,
) -> tuple[bool, str | None]:
    """Return (is_stale, fingerprint_to_pin_if_done).

    Stale only when the *relevant* parameter slice changed — not when the JSON
    file mtime bumps for an unrelated field (e.g. auto-clamped ``n_batch_*``).
    """
    current = _param_fingerprint(step_id, parameter)
    stored = fps.get(step_id)
    if stored is None:
        # First sight of a done artifact: accept current params as baseline.
        return False, current
    if stored == current:
        return False, current
    # Slice changed. If artifacts are newer than the parameter file, a re-run
    # already matched the new params but the fingerprint was not pinned yet.
    if artifact_mtime is not None and not _newer(param_mtime, artifact_mtime):
        return False, current
    return True, None


def _child_dir_count(root: Path, child: str) -> tuple[int, int, float | None, Path | None]:
    """Count recording folders that contain ``child`` (spectrogram / labels).

    Only the named child counts. A spectrogram tree must not make ``labels`` look done.
    """
    if not root.is_dir():
        return 0, 0, None, None
    count = 0
    size = 0
    newest: float | None = None
    for entry in root.iterdir():
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        target = entry / child
        if not target.exists():
            continue
        count += 1
        _files, bytes_, mtime = (
            _dir_stats(target)
            if target.is_dir()
            else (1, target.stat().st_size, target.stat().st_mtime)
        )
        size += bytes_
        newest = mtime if newest is None else (
            mtime if mtime is not None and mtime > newest else newest
        )
    if count:
        return count, size, newest, root
    return 0, 0, None, root


def _file_bundle(paths: list[Path]) -> tuple[int, int, float | None]:
    files = 0
    size = 0
    newest: float | None = None
    for path in paths:
        if not path.exists():
            continue
        if path.is_file():
            files += 1
            stat = path.stat()
            size += stat.st_size
            newest = stat.st_mtime if newest is None else max(newest, stat.st_mtime)
            continue
        if path.is_dir():
            d_files, d_size, d_mtime = _dir_stats(path)
            files += d_files
            size += d_size
            newest = _max_mtime(newest, d_mtime)
    return files, size, newest


def _annotation_stats(project_dir: Path, table_path: Path | None, table_rows: int) -> dict[str, Any]:
    ann = annotations_dir(project_dir)
    wav_stems = {path.stem for path in list_wav_files(recordings_dir(project_dir))}
    txts: list[Path] = []
    if ann.is_dir():
        txts = [
            path
            for path in ann.rglob("*.txt")
            if path.is_file() and not _is_hidden(path.relative_to(ann))
        ]
    # A filled base_dir_annotation is the project folder, not a label file.
    # paired_txt is a manual .txt whose stem matches a loaded WAV (nested files
    # count; *_predicted / *_filtered do not). A CSV rel_annotation_path without
    # that file does not cover a WAV for the skip lamp or the «0 из N» lamp.
    annotated: set[str] = set()
    paired_txt: set[str] = set()
    for path in txts:
        name = path.name.lower()
        if name.endswith("_predicted.txt") or name.endswith("_filtered.txt"):
            continue
        stem = path.stem
        if stem in wav_stems:
            paired_txt.add(stem)
            annotated.add(stem)
            continue
        if not wav_stems:
            annotated.add(stem)
    if table_path is not None and table_path.is_file():
        try:
            with table_path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                fields = reader.fieldnames or []
                rec_key = fields[0] if fields else "recording"
                for row in reader:
                    rec = (row.get(rec_key) or row.get("recording") or "").strip()
                    rel = (row.get("rel_annotation_path") or "").strip()
                    if not rec or not rel:
                        continue
                    stem = Path(rec).stem
                    if wav_stems and stem not in wav_stems:
                        continue
                    annotated.add(stem)
        except (OSError, csv.Error):
            pass
    wav_count = len(wav_stems)
    total = wav_count if wav_stems else table_rows
    annotated_count = len(annotated)
    # WAV files that will be skipped: no annotation .txt with the same stem.
    unlabeled = wav_count - len(paired_txt)
    newest = None
    for path in txts:
        newest = _max_mtime(newest, _mtime(path))
    return {
        "annotated_count": annotated_count,
        "paired_txt_count": len(paired_txt),
        "wav_count": wav_count,
        "unlabeled_count": unlabeled,
        "total_count": total,
        "annotation_files": len(txts),
        "updated_at": newest,
    }


def _annotations_readiness(ann: dict[str, Any]) -> dict[str, Any]:
    """Lamp numbers follow paired .txt files whenever WAV files are loaded.

    A CSV ``rel_annotation_path`` without that file must not turn the lamp green
    or change «0 из N». With no WAV files, keep the file/table count (a label
    added before its recording).
    """
    if ann["wav_count"] > 0:
        shown = ann["paired_txt_count"]
        total = ann["wav_count"]
    else:
        shown = ann["annotated_count"]
        total = ann["total_count"]
    if shown > 0:
        state = "ok"
    elif total > 0:
        state = "warn"
    else:
        state = "off"
    return {
        "state": state,
        "annotated": shown,
        "total": total,
        "paired": ann["paired_txt_count"],
        "wav_count": ann["wav_count"],
    }


def lacks_paired_annotation_txt(project_dir: Path) -> bool:
    """True when the project has WAV files and none has a matching annotation .txt."""
    project_dir = Path(project_dir).resolve()
    table_path = resolve_recording_table_path(project_dir)
    table_rows = _table_row_count(table_path)
    ann = _annotation_stats(project_dir, table_path, table_rows)
    return ann["wav_count"] > 0 and ann["paired_txt_count"] <= 0


def _block_steps_without_annotations(
    steps: list[dict[str, Any]],
    ann: dict[str, Any],
) -> None:
    """Keep spectrograms runnable; hold every later step until a paired .txt exists."""
    if not (ann["wav_count"] > 0 and ann["paired_txt_count"] <= 0):
        return
    for step in steps:
        if step["id"] not in STEPS_NEEDING_ANNOTATION_TXT:
            continue
        if step["status"] in (STATUS_RUNNING, STATUS_QUEUED):
            continue
        step["can_run"] = False
        if step["status"] != STATUS_DONE:
            step["status"] = STATUS_BLOCKED
            step["reason"] = "no_annotations"


def _job_belongs(params: dict[str, Any], project_dir: Path) -> bool:
    want = normalize_project_dir(project_dir)
    if not want:
        return False
    if normalize_project_dir(params.get("project_dir")) == want:
        return True
    root = str(project_dir.resolve())
    for value in params.values():
        if not isinstance(value, str) or not value:
            continue
        candidate = normalize_project_dir(value)
        if candidate == want:
            return True
        if value == root or value.startswith(root + "/") or value.startswith(root + "\\"):
            return True
    return False


def _plan_id_of_params(params: dict[str, Any]) -> str | None:
    raw = params.get("plan_id")
    if not isinstance(raw, str):
        return None
    plan_id = raw.strip()
    return plan_id or None


def _active_wizard_plan(
    jobs: list[dict[str, Any]], project_dir: Path
) -> dict[str, Any] | None:
    """Best pending/running wizard plan for this project (Desktop ``plan_id`` tag)."""
    by_plan: dict[str, dict[str, Any]] = {}
    for job in jobs:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        plan_id = _plan_id_of_params(params)
        if not plan_id or not _job_belongs(params, project_dir):
            continue
        status = str(job.get("status") or "")
        if status not in ("pending", "running"):
            continue
        bucket = by_plan.setdefault(
            plan_id,
            {
                "plan_id": plan_id,
                "queued": 0,
                "running": 0,
                "updated_at": 0.0,
                "job_id": None,
            },
        )
        updated = float(job.get("updated_at") or 0)
        if updated >= float(bucket["updated_at"]):
            bucket["updated_at"] = updated
        if status == "running":
            bucket["running"] = int(bucket["running"]) + 1
            bucket["job_id"] = job.get("id")
        else:
            bucket["queued"] = int(bucket["queued"]) + 1
            if not bucket["job_id"]:
                bucket["job_id"] = job.get("id")
    if not by_plan:
        return None
    running = [p for p in by_plan.values() if int(p["running"]) > 0]
    candidates = running or list(by_plan.values())
    best = max(candidates, key=lambda p: float(p["updated_at"]))
    plan_id = str(best["plan_id"])
    # Full command set for this plan (any status) — used to gate optional hpsearch
    # on the board when the wizard launched without opt-in.
    commands: list[str] = []
    seen: set[str] = set()
    for job in jobs:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if _plan_id_of_params(params) != plan_id:
            continue
        if not _job_belongs(params, project_dir):
            continue
        command = str(job.get("command") or "").strip()
        if not command or command in seen:
            continue
        seen.add(command)
        commands.append(command)
    return {
        "plan_id": plan_id,
        "queued": int(best["queued"]),
        "running": int(best["running"]),
        "job_id": best["job_id"],
        "commands": commands,
        "includes_hpsearch": "hpsearch" in seen,
    }


def _latest_jobs(jobs: list[dict[str, Any]], project_dir: Path) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for job in jobs:
        command = str(job.get("command") or "")
        if command not in TRAIN_STEP_IDS:
            continue
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if not _job_belongs(params, project_dir):
            continue
        prev = latest.get(command)
        if prev is None or float(job.get("updated_at") or 0) >= float(prev.get("updated_at") or 0):
            latest[command] = job
    return latest


def _step_payload(
    *,
    step_id: str,
    order: int,
    optional: bool,
    status: str,
    reason: str | None,
    artifact_path: str,
    artifact_label: str,
    file_count: int,
    size_bytes: int,
    updated_at: float | None,
    job: dict[str, Any] | None,
    run_params: dict[str, Any],
    artifact_kind: str = "files",
) -> dict[str, Any]:
    can_run = status not in _BUSY
    return {
        "id": step_id,
        "order": order,
        "optional": optional,
        "status": status,
        "reason": reason,
        "command": step_id,
        "artifact_path": artifact_path,
        "artifact_label": artifact_label,
        "file_count": file_count,
        "size_bytes": size_bytes,
        "updated_at": updated_at,
        "artifact_kind": artifact_kind,
        "job_id": job.get("id") if job else None,
        "job_status": job.get("status") if job else None,
        "progress": job.get("progress") if job else None,
        "error": job.get("error") if job and status == STATUS_ERROR else None,
        "can_run": can_run,
        "run_params": run_params,
    }


def inspect_pipeline(
    project_dir: Path,
    *,
    orcai_name: str,
    jobs: list[dict[str, Any]] | None = None,
    accelerator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute eight-step disk state. No UI flags — only the project tree + jobs."""
    project_dir = project_dir.resolve()
    param_path = project_dir / f"{orcai_name}_orcai_parameter.json"
    parameter = _read_json_file(param_path) or {}
    if not isinstance(parameter, dict):
        parameter = {}
    model = parameter.get("model") if isinstance(parameter.get("model"), dict) else {}
    spectrogram = (
        parameter.get("spectrogram") if isinstance(parameter.get("spectrogram"), dict) else {}
    )
    snippets = parameter.get("snippets") if isinstance(parameter.get("snippets"), dict) else {}
    calls = _parameter_calls(parameter)
    param_fps = _load_param_fps(project_dir)
    param_fps_dirty = False

    table_path = resolve_recording_table_path(project_dir)
    table_rows = _table_row_count(table_path)
    table_mtime = _mtime(table_path)
    param_mtime = _mtime(param_path)

    spec_root = project_dir / "spectrograms"
    label_root = project_dir / "label_arrays"
    combined_root = project_dir / "recording_data"
    tvt_dir = project_dir / "tvt_data"
    models_dir = project_dir / "models"
    hpsearch_dir = project_dir / "hpsearch"

    spec_count, spec_size, spec_mtime, spec_path = _child_dir_count(spec_root, "spectrogram")
    if spec_count == 0:
        spec_count, spec_size, spec_mtime, spec_path = _child_dir_count(combined_root, "spectrogram")
    label_count, label_size, label_mtime, label_path = _child_dir_count(label_root, "labels")
    if label_count == 0:
        label_count, label_size, label_mtime, label_path = _child_dir_count(combined_root, "labels")
    if label_count == 0:
        label_count, label_size, label_mtime, label_path = _child_dir_count(spec_root, "labels")

    snippet_file = tvt_dir / "all_snippets.csv.gz"
    snippet_count, snippet_size, snippet_mtime = _file_bundle([snippet_file])
    snippet_rows = _gzip_data_rows(snippet_file)
    # Per-split inventory for readiness (orcAI create_tvt raises on *any* short
    # split). Prefer filtered counts when orcAI is importable.
    snippet_by_type: dict[str, int] = {}
    if snippet_file.is_file():
        snippet_by_type = _snippet_rows_by_type(snippet_file)
        with contextlib.suppress(Exception):
            from orcai_desktop_sidecar.adapters.training import (
                _counts_after_orcai_filter,
            )

            filtered = _counts_after_orcai_filter(snippet_file, parameter)
            if filtered:
                snippet_by_type = {
                    str(k): int(v) for k, v in filtered.items()
                }
    train_snippet_rows = (
        int(snippet_by_type.get("train") or 0) if snippet_by_type else snippet_rows
    )

    tvt_tables = [tvt_dir / f"{name}.csv.gz" for name in _TVT_SPLITS]
    tvt_table_count, tvt_table_size, tvt_table_mtime = _file_bundle(tvt_tables)
    tvt_tables_ready = all(path.is_file() for path in tvt_tables)

    tvt_datasets = [tvt_dir / f"{name}_dataset" for name in _TVT_SPLITS]
    tvt_data_count, tvt_data_size, tvt_data_mtime = _file_bundle(tvt_datasets)
    tvt_data_ready = all(path.exists() for path in tvt_datasets)

    hp_files, hp_size, hp_mtime = _dir_stats(hpsearch_dir) if hpsearch_dir.is_dir() else (0, 0, None)
    model_name = str(parameter.get("name") or orcai_name or "").strip()
    keras_files = [
        path
        for path in models_dir.rglob("*.keras")
        if path.is_file()
        and "hpsearch" not in path.parts
        and not _is_hidden(path.relative_to(models_dir))
        and (
            not model_name
            or path.parent.name == model_name
            or path.stem == model_name
        )
    ] if models_dir.is_dir() else []
    history = models_dir / "training_history.json"
    shape = models_dir / "model_shape.json"
    train_paths = [*keras_files]
    if history.is_file():
        train_paths.append(history)
    if shape.is_file():
        train_paths.append(shape)
    train_count, train_size, train_mtime = _file_bundle(train_paths)
    if not train_mtime and keras_files:
        train_mtime = max(p.stat().st_mtime for p in keras_files)

    test_dir = models_dir / "test"
    metric_files = (
        list(test_dir.rglob("*_metrics.json"))
        if test_dir.is_dir()
        else []
    )
    if not metric_files and models_dir.is_dir():
        metric_files = [
            path
            for path in models_dir.rglob("*_metrics.json")
            if path.is_file() and not _is_hidden(path.relative_to(models_dir))
        ]
    test_count, test_size, test_mtime = _file_bundle(metric_files if metric_files else ([test_dir] if test_dir.is_dir() else []))

    ann = _annotation_stats(project_dir, table_path, table_rows)
    latest = _latest_jobs(jobs or [], project_dir)
    active_plan = _active_wizard_plan(jobs or [], project_dir)

    n_batch_train = _int_param(model, "n_batch_train", "n_batch", default=0)
    n_batch_val = _int_param(model, "n_batch_val", default=0)
    n_batch_test = _int_param(model, "n_batch_test", default=0)
    batch_size = _int_param(model, "batch_size", default=0)
    n_epochs = _int_param(model, "epochs", "n_epochs", default=0)
    required_snippets = n_batch_train * batch_size if n_batch_train and batch_size else 0
    snippet_duration = _float_param(snippets, "snippet_duration", default=4.0)
    snippets_per_sec = _float_param(snippets, "snippets_per_sec", default=3.0)

    rec_dir = recordings_dir(project_dir)
    wavs = list_wav_files(rec_dir)
    wav_bytes = 0
    for wav in wavs:
        try:
            wav_bytes += wav.stat().st_size
        except OSError:
            continue
    try:
        disk = shutil.disk_usage(project_dir if project_dir.is_dir() else Path.home())
        free_bytes = int(disk.free)
        disk_measured = True
    except OSError:
        free_bytes = 0
        disk_measured = False
    needed_bytes = estimate_pipeline_disk_needed(
        wav_bytes=wav_bytes,
        table_rows=table_rows,
        spec_count=spec_count,
        label_count=label_count,
        tvt_data_ready=tvt_data_ready,
        train_ready=train_count > 0,
        required_snippets=required_snippets,
        snippet_rows=snippet_rows,
        n_batch_train=n_batch_train,
        n_batch_val=n_batch_val,
        n_batch_test=n_batch_test,
        batch_size=batch_size,
        snippet_duration=snippet_duration,
        snippets_per_sec=snippets_per_sec,
    )

    rec_data_dir = spec_path if spec_count else (combined_root if combined_root.is_dir() else spec_root)
    table_str = str(table_path) if table_path else str(project_dir / "recording_table.csv")
    param_str = str(param_path)

    want_unfiltered = _want_unfiltered_test(tvt_dir, latest)
    finetune_lmf = _resolve_finetune_load_model(latest)
    equivalences_path = _resolve_call_equivalences_path(project_dir)

    def params_for(step_id: str) -> dict[str, Any]:
        common = {"project_dir": str(project_dir), "orcai_parameter": param_str}
        if step_id == "create-spectrograms":
            return {
                **common,
                "recording_table_path": table_str,
                "output_dir": str(combined_root),
                "overwrite": True,
            }
        if step_id == "create-label-arrays":
            label_params: dict[str, Any] = {
                **common,
                "recording_table_path": table_str,
                "output_dir": str(combined_root),
                "base_dir_annotation": str(annotations_dir(project_dir)),
                "overwrite": True,
            }
            # QA-C1: board re-run must keep wizard synonyms (-ce), not identity-only.
            if equivalences_path is not None:
                label_params["call_equivalences"] = str(equivalences_path)
            return label_params
        if step_id == "create-snippet-table":
            return {
                **common,
                "recording_table_path": table_str,
                "recording_data_dir": str(combined_root if combined_root.is_dir() else rec_data_dir),
                "output_dir": str(tvt_dir),
            }
        if step_id == "create-tvt-snippet-tables":
            tvt_snip: dict[str, Any] = {
                **common,
                "output_dir": str(tvt_dir),
                "snippet_table": str(snippet_file),
                "overwrite": True,
            }
            # QA-C2: mirror wizard testAfterTrain → -uts.
            if want_unfiltered:
                tvt_snip["create_unfiltered_test_snippets"] = True
            return tvt_snip
        if step_id == "create-tvt-data":
            return {**common, "tvt_dir": str(tvt_dir), "overwrite": True}
        if step_id == "hpsearch":
            hp_params: dict[str, Any] = {
                **common,
                "data_dir": str(tvt_dir),
                "output_dir": str(hpsearch_dir),
            }
            hps_path = _resolve_hps_parameter_path(project_dir, parameter, orcai_name)
            if hps_path is not None:
                hp_params["hps_parameter"] = str(hps_path)
            return hp_params
        if step_id == "train":
            train_params: dict[str, Any] = {
                **common,
                "data_dir": str(tvt_dir),
                "output_dir": str(models_dir),
            }
            # QA-C3: board re-run of finetune keeps -lm / -lmf from last train job.
            if finetune_lmf:
                train_params["load_model"] = finetune_lmf
            # TRN-01 / QA-15: apply hpsearch winners only on explicit opt-in
            # (wizard plan sets apply_best_hyperparameters). Do not sticky-merge
            # from leftover best_hyperparameters.json on every board Train.
            return train_params
        # orcAI test loads ``model_dir/orcai_parameter.json`` (train writes under
        # ``models/<parameter.name>/``).
        model_name = str(parameter.get("name") or orcai_name or "").strip()
        test_model_dir = models_dir / model_name if model_name else models_dir
        test_params: dict[str, Any] = {
            "project_dir": str(project_dir),
            "model_dir": str(test_model_dir),
            "data_dir": str(tvt_dir),
        }
        # Always explicit: orcAI ``test_model`` defaults ``test_unfiltered`` to True.
        test_params["test_unfiltered"] = bool(want_unfiltered)
        return test_params

    def resolve_status(
        step_id: str,
        *,
        has_artifact: bool,
        artifact_mtime: float | None,
        blocked_reason: str | None,
        dep_mtime: float | None,
    ) -> tuple[str, str | None]:
        nonlocal param_fps_dirty
        job = latest.get(step_id)
        job_status = str(job.get("status") or "") if job else ""
        if job_status == "running":
            return STATUS_RUNNING, None
        if job_status == "pending":
            return STATUS_QUEUED, None
        if blocked_reason and not has_artifact:
            if job_status == "failed":
                return STATUS_ERROR, "job_failed"
            return STATUS_BLOCKED, blocked_reason
        if not has_artifact:
            if job_status == "failed":
                return STATUS_ERROR, "job_failed"
            return STATUS_IDLE, None
        if job_status == "failed" and _newer(float(job.get("updated_at") or 0), artifact_mtime):
            return STATUS_ERROR, "job_failed"
        params_stale, pin_fp = _params_make_step_stale(
            step_id,
            parameter=parameter,
            fps=param_fps,
            artifact_mtime=artifact_mtime,
            param_mtime=param_mtime,
        )
        if params_stale:
            return STATUS_STALE, _stale_param_reason(step_id)
        if _newer(dep_mtime, artifact_mtime):
            return STATUS_STALE, "upstream_changed"
        if pin_fp is not None and param_fps.get(step_id) != pin_fp:
            param_fps[step_id] = pin_fp
            param_fps_dirty = True
        return STATUS_DONE, None

    spec_blocked = None
    if table_path is None or table_rows <= 0:
        spec_blocked = "missing_recording_table" if table_path is None else "no_recordings"
    spec_status, spec_reason = resolve_status(
        "create-spectrograms",
        has_artifact=spec_count > 0,
        artifact_mtime=spec_mtime,
        blocked_reason=spec_blocked,
        dep_mtime=table_mtime,
    )

    label_blocked = None
    if spec_blocked:
        label_blocked = spec_blocked
    elif ann["annotated_count"] <= 0 and ann["annotation_files"] <= 0:
        label_blocked = "no_annotations"
    label_status, label_reason = resolve_status(
        "create-label-arrays",
        has_artifact=label_count > 0,
        artifact_mtime=label_mtime,
        blocked_reason=label_blocked,
        dep_mtime=_max_mtime(table_mtime, ann["updated_at"]),
    )

    snippet_blocked = None
    if spec_count <= 0:
        snippet_blocked = "missing_spectrograms"
    elif label_count <= 0:
        snippet_blocked = "missing_label_arrays"
    snippet_status, snippet_reason = resolve_status(
        "create-snippet-table",
        has_artifact=snippet_file.is_file(),
        artifact_mtime=snippet_mtime,
        blocked_reason=snippet_blocked,
        dep_mtime=_max_mtime(spec_mtime, label_mtime),
    )

    tvt_table_blocked = None if snippet_file.is_file() else "missing_snippet_table"
    tvt_table_status, tvt_table_reason = resolve_status(
        "create-tvt-snippet-tables",
        has_artifact=tvt_tables_ready,
        artifact_mtime=tvt_table_mtime,
        blocked_reason=tvt_table_blocked,
        dep_mtime=snippet_mtime,
    )

    tvt_data_blocked = None if tvt_tables_ready else "missing_tvt_tables"
    tvt_data_status, tvt_data_reason = resolve_status(
        "create-tvt-data",
        has_artifact=tvt_data_ready,
        artifact_mtime=tvt_data_mtime,
        blocked_reason=tvt_data_blocked,
        dep_mtime=tvt_table_mtime,
    )

    hp_blocked = None if tvt_data_ready else "missing_tvt_data"
    hp_status, hp_reason = resolve_status(
        "hpsearch",
        has_artifact=hp_files > 0,
        artifact_mtime=hp_mtime,
        blocked_reason=hp_blocked,
        dep_mtime=tvt_data_mtime,
    )

    train_blocked = None if tvt_data_ready else "missing_tvt_data"
    train_status, train_reason = resolve_status(
        "train",
        has_artifact=len(keras_files) > 0,
        artifact_mtime=train_mtime,
        blocked_reason=train_blocked,
        dep_mtime=tvt_data_mtime,
    )

    test_blocked = None if keras_files else "missing_checkpoint"
    test_status, test_reason = resolve_status(
        "test",
        has_artifact=test_count > 0,
        artifact_mtime=test_mtime,
        blocked_reason=test_blocked,
        dep_mtime=train_mtime,
    )

    steps = [
        _step_payload(
            step_id="create-spectrograms",
            order=1,
            optional=False,
            status=spec_status,
            reason=spec_reason,
            artifact_path=str(spec_path or spec_root),
            artifact_label="spectrograms/",
            file_count=spec_count,
            size_bytes=spec_size,
            updated_at=spec_mtime,
            job=latest.get("create-spectrograms"),
            run_params=params_for("create-spectrograms"),
            artifact_kind="recordings",
        ),
        _step_payload(
            step_id="create-label-arrays",
            order=2,
            optional=False,
            status=label_status,
            reason=label_reason,
            artifact_path=str(label_path or label_root),
            artifact_label="label_arrays/",
            file_count=label_count,
            size_bytes=label_size,
            updated_at=label_mtime,
            job=latest.get("create-label-arrays"),
            run_params=params_for("create-label-arrays"),
            artifact_kind="recordings",
        ),
        _step_payload(
            step_id="create-snippet-table",
            order=3,
            optional=False,
            status=snippet_status,
            reason=snippet_reason,
            artifact_path=str(snippet_file if snippet_file.is_file() else tvt_dir),
            artifact_label="all_snippets.csv.gz",
            file_count=snippet_rows if snippet_rows is not None else snippet_count,
            size_bytes=snippet_size,
            updated_at=snippet_mtime,
            job=latest.get("create-snippet-table"),
            run_params=params_for("create-snippet-table"),
            artifact_kind="rows",
        ),
        _step_payload(
            step_id="create-tvt-snippet-tables",
            order=4,
            optional=False,
            status=tvt_table_status,
            reason=tvt_table_reason,
            artifact_path=str(tvt_dir),
            artifact_label="tvt_data/",
            file_count=tvt_table_count,
            size_bytes=tvt_table_size,
            updated_at=tvt_table_mtime,
            job=latest.get("create-tvt-snippet-tables"),
            run_params=params_for("create-tvt-snippet-tables"),
            artifact_kind="tables",
        ),
        _step_payload(
            step_id="create-tvt-data",
            order=5,
            optional=False,
            status=tvt_data_status,
            reason=tvt_data_reason,
            artifact_path=str(tvt_dir),
            artifact_label="tvt_data/",
            file_count=tvt_data_count,
            size_bytes=tvt_data_size,
            updated_at=tvt_data_mtime,
            job=latest.get("create-tvt-data"),
            run_params=params_for("create-tvt-data"),
            artifact_kind="datasets",
        ),
        _step_payload(
            step_id="hpsearch",
            order=6,
            optional=True,
            status=hp_status,
            reason=hp_reason,
            artifact_path=str(hpsearch_dir),
            artifact_label="hpsearch/",
            file_count=hp_files,
            size_bytes=hp_size,
            updated_at=hp_mtime,
            job=latest.get("hpsearch"),
            run_params=params_for("hpsearch"),
            artifact_kind="files",
        ),
        _step_payload(
            step_id="train",
            order=7,
            optional=False,
            status=train_status,
            reason=train_reason,
            artifact_path=str(models_dir),
            artifact_label="models/",
            file_count=train_count,
            size_bytes=train_size,
            updated_at=train_mtime,
            job=latest.get("train"),
            run_params=params_for("train"),
            artifact_kind="models",
        ),
        _step_payload(
            step_id="test",
            order=8,
            optional=False,
            status=test_status,
            reason=test_reason,
            artifact_path=str(test_dir if test_dir.exists() else models_dir),
            artifact_label="models/",
            file_count=test_count,
            size_bytes=test_size,
            updated_at=test_mtime,
            job=latest.get("test"),
            run_params=params_for("test"),
            artifact_kind="files",
        ),
    ]

    accel = accelerator or {}
    gpu_available = bool(accel.get("gpu_available"))
    backend = str(accel.get("gpu_backend") or accel.get("accelerator_hint") or "cpu")
    active_device = str(accel.get("active_compute_device") or "").strip().lower()
    # Readiness lamp: green for CPU / no session; blue only when the *session* is GPU.
    # Do not infer session from probe-only gpu_available (Metal present ≠ active GPU).
    accel_state = "info" if active_device == "gpu" else "ok"

    freq = spectrogram.get("freq_range") if isinstance(spectrogram.get("freq_range"), list) else [0, 16000]
    freq_lo = int(freq[0]) if freq else 0
    freq_hi = int(freq[1]) if freq and len(freq) > 1 else 16000

    disk_state = disk_readiness_state(
        free_bytes=free_bytes,
        needed_bytes=needed_bytes,
        measured=disk_measured,
    )

    # Green only when every loaded WAV has a matching annotation .txt.
    # Any other mix (none, partial, or no recordings) stays yellow and reports
    # how many WAV files will be skipped.
    unlabeled_state = (
        "ok"
        if ann["wav_count"] > 0 and ann["paired_txt_count"] == ann["wav_count"]
        else "warn"
    )
    # Match orcAI create-tvt-snippet-tables: each split's n_batch x batch_size must
    # fit filtered inventory or upstream raises ValueError. Desktop may still
    # clamp at job start; the lamp warns that the parameter request exceeds inventory.
    # Report the worst shortfall so the lamp/sub/banner stay consistent.
    snippet_state = "ok"
    report_actual: int | None = train_snippet_rows
    report_required = (
        n_batch_train * batch_size if n_batch_train and batch_size else 0
    )
    report_n_batch = n_batch_train
    report_split = "train"
    if batch_size and snippet_file.is_file():
        worst_deficit = -1
        for split, n_batch in (
            ("train", n_batch_train),
            ("val", n_batch_val),
            ("test", n_batch_test),
        ):
            if not n_batch:
                continue
            required = n_batch * batch_size
            actual = int(snippet_by_type.get(split) or 0)
            if actual < required:
                deficit = required - actual
                if deficit > worst_deficit:
                    worst_deficit = deficit
                    report_actual = actual
                    report_required = required
                    report_n_batch = n_batch
                    report_split = split
        if worst_deficit >= 0:
            snippet_state = "warn"
    elif required_snippets and (train_snippet_rows or 0) < required_snippets:
        snippet_state = "off"

    if param_fps_dirty:
        _save_param_fps(project_dir, param_fps)

    _block_steps_without_annotations(steps, ann)

    return {
        "project_id": None,
        "project_dir": str(project_dir),
        "parameter_path": str(param_path),
        "parameter_filename": param_path.name,
        "parameter_exists": param_path.is_file(),
        "active_plan": active_plan,
        "steps": steps,
        "readiness": {
            "recordings": {
                "state": "ok" if table_rows > 0 else "off",
                "rows": table_rows,
                "path": str(table_path) if table_path else None,
            },
            "annotations": _annotations_readiness(ann),
            "unlabeled": {
                "state": unlabeled_state,
                "count": ann["unlabeled_count"],
            },
            "classes": {
                "state": "ok" if calls else "off",
                "found": len(calls),
                "names": calls,
                "source": "parameters" if calls else "none",
            },
            "snippets": {
                "state": snippet_state,
                "actual": report_actual,
                "required": report_required,
                "n_batch": report_n_batch,
                "batch_size": batch_size,
                "split": report_split,
            },
            "disk": {
                "state": disk_state,
                "free_bytes": free_bytes,
                "needed_bytes": needed_bytes,
            },
            "accelerator": {
                "state": accel_state,
                "gpu_available": gpu_available,
                "backend": backend,
                "devices": accel.get("gpu_devices") or [],
                "hint": accel.get("accelerator_hint"),
                "active_compute_device": active_device or "cpu",
            },
        },
        "parameters": {
            "architecture": str(parameter.get("architecture") or "—"),
            "sampling_rate": _int_param(spectrogram, "sampling_rate", default=48_000),
            "nfft": _int_param(spectrogram, "nfft", default=512),
            "n_overlap": _int_param(spectrogram, "n_overlap", default=256),
            "freq_low": freq_lo,
            "freq_high": freq_hi,
            "snippet_duration": _float_param(snippets, "snippet_duration", default=4),
            "snippets_per_sec": _float_param(snippets, "snippets_per_sec", default=3),
            "split_train": _float_param(snippets, "train", default=0.8),
            "split_val": _float_param(snippets, "val", default=0.1),
            "split_test": _float_param(snippets, "test", default=0.1),
            "epochs": n_epochs,
            "batch_size": batch_size,
            "n_batch_train": n_batch_train,
        },
    }


def get_project_pipeline(project_id: str) -> dict[str, Any]:
    project = _require_project(project_id)
    project_dir = Path(project["path"]).resolve()
    jobs = list_all_jobs(project_dir=str(project_dir), limit=200)
    accelerator: dict[str, Any] = {}
    try:
        from orcai_desktop_sidecar.engine import get_cached_accelerator_summary

        accelerator = get_cached_accelerator_summary()
    except Exception:  # noqa: BLE001 — probe is optional for the board
        accelerator = {}
    payload = inspect_pipeline(
        project_dir,
        orcai_name=str(project.get("orcai_name") or "orcai-v1"),
        jobs=jobs,
        accelerator=accelerator,
    )
    payload["project_id"] = project_id
    payload["orcai_name"] = project.get("orcai_name")
    return payload
