"""predict and filter-predictions adapters (engine defaults via pass-through)."""

from __future__ import annotations

import contextlib
import csv
import os
import re
import tempfile
import time
from importlib.resources import files
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.engine_call import (
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
)

PREDICT_SELECTION_DIRNAME = ".orcai-desktop"
PREDICT_SELECTION_CSV_NAME = "predict_selection.csv"


def predict_selection_csv_path(project_dir: str | Path) -> Path:
    """Stable CSV sidecar writes for a subset of recording_table.csv."""
    return Path(project_dir).resolve() / PREDICT_SELECTION_DIRNAME / PREDICT_SELECTION_CSV_NAME


# Structured line for Desktop console / queue sync (orcAI CSV uses silent per-file msgr).
PREDICT_FILE_LOG_RE = re.compile(
    r"^\[predict-file\]\s+(\d+)/(\d+)\s+(\S+)",
)
_STEM_FROM_TQDM_RE = re.compile(r"^([^:\-]+?)(?:\s*[-:].*)?$")


def _default_call_duration_limits_path() -> str:
    return str(files("orcai.defaults").joinpath("default_call_duration_limits.json"))


def resolve_call_duration_limits(params: dict[str, Any]) -> str | None:
    """
    Resolve call-duration limits when the job asks for them.

    If the key is absent, or value is null/empty: return None so orcAI keeps
    its own default (predict: no duration filter; filter-predictions: package
    default). Explicit path is passed through. Sentinels ``project`` / ``auto``
    resolve the newest ``*_call_duration_limits.json`` under ``project_dir``,
    then the bundled package default.
    """
    if "call_duration_limits" not in params:
        return None
    explicit = params.get("call_duration_limits")
    if explicit in (None, ""):
        # PRED-01 / PRED-02: null ≠ "use project/package file"
        return None

    token = str(explicit).strip()
    if token in ("project", "auto"):
        project_dir = params.get("project_dir")
        if project_dir:
            root = Path(str(project_dir))
            if root.is_dir():
                for path in sorted(root.glob("*_call_duration_limits.json")):
                    if path.is_file():
                        return str(path.resolve())
        return _default_call_duration_limits_path()
    if token == "default":
        return _default_call_duration_limits_path()
    return token


def _model_parameter_name(model_dir: Path) -> str:
    from orcai.io import read_json

    param_path = model_dir / "orcai_parameter.json"
    if param_path.is_file():
        return str(read_json(param_path)["name"])
    return model_dir.name


def resolve_predict_output_path(
    recording_path: str | Path,
    channel: int,
    model_dir: Path,
    output_path: str | Path = "default",
) -> Path:
    recording_path = Path(recording_path)
    if str(output_path) != "default":
        return Path(output_path).resolve()
    model_name = _model_parameter_name(model_dir)
    filename = f"{recording_path.stem}_c{channel}_{model_name}_predicted.txt"
    return recording_path.with_name(filename).resolve()


def resolve_csv_batch_label_path(
    *,
    wav_path: Path | None,
    stem: str,
    channel: int,
    model_dir: Path,
    output_param: Any,
) -> Path | None:
    """Mirror orcAI CSV naming: custom -o is a directory of per-recording files."""
    if str(output_param) != "default":
        return Path(str(output_param)).joinpath(
            f"{stem}_{model_dir.stem}_predicted.txt"
        ).resolve()
    if wav_path is None:
        return None
    return resolve_predict_output_path(wav_path, channel, model_dir, "default")


def resolve_filtered_output_path(predicted_labels_path: str | Path) -> Path:
    path = Path(predicted_labels_path)
    return path.with_name(f"{path.stem}_filtered.txt").resolve()


def _resolve_model_dir_if_requested(params: dict[str, Any]) -> Path | None:
    """Only resolve when the job provided model_dir or model; else orcAI default."""
    if params.get("model_dir"):
        return Path(str(params["model_dir"]))
    if params.get("model"):
        return Path(str(files("orcai.models").joinpath(str(params["model"]))))
    return None


def _messenger(job_id: str, params: dict[str, Any], title: str) -> Any:
    from orcai_desktop_sidecar.messenger import JobMessenger

    # Verbosity for logging only; if omitted, match orcAI predict default (2).
    verbosity = int(params["verbosity"]) if "verbosity" in params else 2
    return JobMessenger(job_id, verbosity=verbosity, title=title)


def _normalize_recording_names(raw: Any) -> list[str] | None:
    if raw is None:
        return None
    if not isinstance(raw, (list, tuple)):
        raise TypeError("recording_names must be a list of recording stems")
    names: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item).strip()
        if not text:
            continue
        base = Path(text).name
        stem = base[:-4] if base.lower().endswith(".wav") else base
        if stem in seen:
            continue
        seen.add(stem)
        names.append(stem)
    return names or None


def prepare_predict_recording_path(
    recording_path: Path,
    *,
    recording_names: list[str] | None,
    job_id: str,
    project_dir: str | None,
) -> tuple[Path, Path | None]:
    """
    Return (path_for_orcai, temp_csv_to_delete).

    When ``recording_names`` is set and input is a CSV, write a filtered table so
    orcAI runs its native CSV batch on the selected rows only.
    """
    if recording_path.suffix.lower() != ".csv" or not recording_names:
        return recording_path, None

    wanted = set(recording_names)

    def _cell_stem(value: str) -> str:
        base = Path(value.strip()).name
        return base[:-4] if base.lower().endswith(".wav") else base

    with recording_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("recording_table.csv has no header")
        fieldnames = list(reader.fieldnames)
        all_rows = list(reader)

    all_stems: set[str] = set()
    for row in all_rows:
        stem = _cell_stem(row.get("recording") or "")
        if stem:
            all_stems.add(stem)

    rows = [
        row
        for row in all_rows
        if _cell_stem(row.get("recording") or "") in wanted
    ]

    present = {_cell_stem(r.get("recording") or "") for r in rows}
    missing = [name for name in recording_names if name not in present]
    if not rows:
        raise ValueError(
            "No matching rows in recording_table.csv for recording_names: "
            + ", ".join(recording_names)
        )
    if missing:
        raise ValueError(
            "recording_table.csv is missing selected recordings: " + ", ".join(missing)
        )

    if wanted == all_stems:
        return recording_path, None

    dest_root = Path(project_dir).resolve() if project_dir else None
    persist = dest_root is not None and dest_root.is_dir()
    if persist:
        cache = dest_root / PREDICT_SELECTION_DIRNAME
        cache.mkdir(parents=True, exist_ok=True)
        dest = cache / PREDICT_SELECTION_CSV_NAME
    else:
        dest = Path(tempfile.mkstemp(prefix=f"orcai_predict_{job_id}_", suffix=".csv")[1])

    with dest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    resolved = dest.resolve()
    return resolved, None if persist else resolved


def _stem_from_tqdm_desc(desc: str | None) -> str | None:
    if not desc:
        return None
    text = str(desc).strip()
    if not text or text == "Starting ...":
        return None
    match = _STEM_FROM_TQDM_RE.match(text)
    if not match:
        return None
    stem = match.group(1).strip()
    return stem or None


class _PredictFileTqdm:
    """Bridge orcAI's CSV tqdm into JobMessenger + job progress (per file)."""

    def __new__(cls, *args: Any, **kwargs: Any):
        from tqdm import tqdm

        class _Impl(tqdm):  # type: ignore[misc, valid-type]
            def __init__(
                self,
                *a: Any,
                job_id: str,
                msgr: Any,
                **kw: Any,
            ) -> None:
                self._job_id = job_id
                self._msgr = msgr
                self._last_stem: str | None = None
                kw.setdefault("disable", False)
                kw["file"] = open(os.devnull, "w")  # noqa: SIM115 — closed in close()
                super().__init__(*a, **kw)

            def set_description(self, desc: str | None = None, refresh: bool = True) -> None:
                stem = _stem_from_tqdm_desc(desc)
                if stem and stem != self._last_stem:
                    self._last_stem = stem
                    total = int(self.total or 0) or 1
                    current = min(int(self.n) + 1, total)
                    self._msgr.print(
                        f"[predict-file] {current}/{total} {stem}",
                        severity=1,
                    )
                    from orcai_desktop_sidecar.jobs import set_progress

                    # Half-credit for the file in flight so UI is not stuck at 0%
                    # during the (often long) first recording.
                    set_progress(self._job_id, min(0.99, (current - 0.5) / total))
                return super().set_description(desc, refresh=refresh)

            def update(self, n: float | None = 1) -> bool | None:
                result = super().update(n)
                total = int(self.total or 0)
                if total > 0:
                    from orcai_desktop_sidecar.jobs import set_progress

                    set_progress(self._job_id, min(1.0, float(self.n) / total))
                return result

            def close(self) -> None:
                sink = getattr(self, "fp", None)
                try:
                    super().close()
                finally:
                    if sink is not None:
                        with contextlib.suppress(Exception):
                            sink.close()

        return _Impl(*args, **kwargs)


def _with_predict_file_tqdm(job_id: str, msgr: Any):
    """Patch ``orcai.predict.tqdm`` for the duration of a CSV batch call."""
    import orcai.predict as predict_mod

    original = predict_mod.tqdm

    def factory(*args: Any, **kwargs: Any) -> Any:
        return _PredictFileTqdm(*args, job_id=job_id, msgr=msgr, **kwargs)

    predict_mod.tqdm = factory  # type: ignore[assignment]
    return original


def _restore_predict_tqdm(original: Any) -> None:
    import orcai.predict as predict_mod

    predict_mod.tqdm = original


def _resolve_table_wav(project_dir: Path | None, row: dict[str, str]) -> Path | None:
    base = (row.get("base_dir_recording") or "").strip()
    rel = (row.get("rel_recording_path") or "").strip()
    stem = (row.get("recording") or "").strip()
    candidates: list[Path] = []
    if base and rel:
        candidates.append(Path(base) / rel)
    if project_dir is not None and rel:
        candidates.append(project_dir / rel)
        candidates.append(project_dir / "recordings" / Path(rel).name)
    if project_dir is not None and stem:
        candidates.append(project_dir / "recordings" / f"{stem}.wav")
    for cand in candidates:
        try:
            if cand.is_file():
                return cand.resolve()
        except OSError:
            continue
    return None


def _collect_csv_batch_files(
    table_path: Path,
    *,
    model_dir: Path,
    output_param: Any,
    project_dir: str | None,
    min_mtime: float | None = None,
) -> list[dict[str, Any]]:
    root = Path(project_dir).resolve() if project_dir else None
    files_out: list[dict[str, Any]] = []
    with table_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        stem = (row.get("recording") or "").strip()
        if not stem:
            continue
        try:
            channel = int(float(str(row.get("channel") or "1")))
        except ValueError:
            channel = 1
        wav_path = _resolve_table_wav(root, row)
        label_path: str | None = None
        status = "failed"
        label = resolve_csv_batch_label_path(
            wav_path=wav_path,
            stem=stem,
            channel=channel,
            model_dir=model_dir,
            output_param=output_param,
        )
        if label is not None and label.is_file():
            label_path = str(label)
            if min_mtime is None:
                status = "completed"
            else:
                try:
                    mtime = label.stat().st_mtime
                except OSError:
                    mtime = 0.0
                status = "completed" if mtime >= min_mtime else "preexisting"
        files_out.append(
            {
                "recording": stem,
                "channel": channel,
                "wav_path": str(wav_path) if wav_path else None,
                "label_path": label_path,
                "status": status,
            }
        )
    return files_out


def sanitize_csv_base_dir_recording(
    job_params: dict[str, Any],
    *,
    is_csv: bool,
    project_dir: str | None,
    warn: Any | None = None,
) -> dict[str, Any]:
    """
    Drop a stale ``base_dir_recording`` override for CSV jobs.

    orcAI rewrites every CSV row when this param is set. A Desktop setting from
    another project yields FileNotFoundError (logged by orcAI as ``: 2``).
    """
    if not is_csv:
        return job_params
    raw_bdr = job_params.get("base_dir_recording")
    if raw_bdr in (None, ""):
        return job_params
    out = dict(job_params)
    bdr_path = Path(str(raw_bdr)).expanduser()
    if not bdr_path.is_dir():
        if warn is not None:
            warn(f"Ignoring missing base_dir_recording override: {bdr_path}")
        out.pop("base_dir_recording", None)
        return out
    if project_dir:
        project_rec = Path(project_dir).resolve() / "recordings"
        try:
            bdr_resolved = bdr_path.resolve()
        except OSError:
            bdr_resolved = bdr_path
        if project_rec.is_dir() and bdr_resolved != project_rec.resolve():
            if warn is not None:
                warn(
                    "Ignoring base_dir_recording outside this project "
                    f"({bdr_path}); using paths from recording_table.csv"
                )
            out.pop("base_dir_recording", None)
    return out


def run_predict(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    if "recording_path" not in params or not params["recording_path"]:
        raise ValueError("recording_path is required")

    from orcai.predict import predict

    from orcai_desktop_sidecar.jobs import set_progress

    set_progress(job_id, 0.0)
    msgr = _messenger(job_id, params, "Predicting calls")
    inject: dict[str, Any] = {"msgr": msgr}
    job_started = time.time()
    model_dir = _resolve_model_dir_if_requested(params)
    if model_dir is not None:
        inject["model_dir"] = model_dir
        msgr.info(f"Model: {model_dir.name}")

    limits = resolve_call_duration_limits(params)
    if limits is not None:
        inject["call_duration_limits"] = limits

    source = Path(str(params["recording_path"])).expanduser().resolve()
    recording_names = _normalize_recording_names(params.get("recording_names"))
    predict_path, temp_csv = prepare_predict_recording_path(
        source,
        recording_names=recording_names,
        job_id=job_id,
        project_dir=params.get("project_dir") if isinstance(params.get("project_dir"), str) else None,
    )
    job_params = dict(params)
    job_params["recording_path"] = str(predict_path)

    is_csv = predict_path.suffix.lower() == ".csv"
    job_params = sanitize_csv_base_dir_recording(
        job_params,
        is_csv=is_csv,
        project_dir=params.get("project_dir")
        if isinstance(params.get("project_dir"), str)
        else None,
        warn=lambda msg: msgr.warning(msg),
    )

    kwargs = engine_kwargs(
        predict,
        job_params,
        required=("recording_path",),
        inject=inject,
        skip=frozenset(
            {
                "model_dir",
                "call_duration_limits",
                "msgr",
                "recording_names",
                "project_dir",
            }
        ),
    )

    original_tqdm = None
    try:
        if is_csv:
            if recording_names:
                msgr.info(
                    f"Batch predict via recording table ({len(recording_names)} files)"
                )
            else:
                msgr.info("Batch predict via recording table")
            original_tqdm = _with_predict_file_tqdm(job_id, msgr)
            set_progress(job_id, 0.02)
        else:
            # Single WAV: no orcAI tqdm — emit one structured line + early progress.
            msgr.print(
                f"[predict-file] 1/1 {source.stem}",
                severity=1,
            )
            set_progress(job_id, 0.05)
        predict(**kwargs)

        effective_model = Path(
            kwargs.get(
                "model_dir",
                str(files("orcai.models").joinpath("orcai-isl-v1")),
            )
        )
        channel = int(kwargs.get("channel", 1))
        output_param = kwargs.get("output_path", "default")

        if is_csv:
            batch_table = predict_path if predict_path.is_file() else source
            batch_files = _collect_csv_batch_files(
                batch_table,
                model_dir=effective_model,
                output_param=output_param,
                project_dir=params.get("project_dir")
                if isinstance(params.get("project_dir"), str)
                else None,
                min_mtime=job_started,
            )
            created = collect_created(
                *[f.get("label_path") for f in batch_files if f.get("label_path")]
            )
            set_progress(job_id, 1.0)
            succeeded = sum(1 for f in batch_files if f.get("status") == "completed")
            msgr.success(f"Batch finished: {succeeded}/{len(batch_files)} files")
            return {
                "recording_path": str(source),
                "batch": True,
                "model": effective_model.stem,
                "output_path": str(output_param),
                "label_path": batch_files[0].get("label_path") if batch_files else None,
                "wav_path": None,
                "files": batch_files,
                "created_files": created,
                "cli_params": cli_params_from_engine(kwargs),
            }

        label_file = resolve_predict_output_path(
            source, channel, effective_model, output_param
        )
        wav = str(source) if source.suffix.lower() == ".wav" else None
        label_path = str(label_file) if label_file.is_file() else None
        created = collect_created(label_path)
        set_progress(job_id, 1.0)

        return {
            "recording_path": str(source),
            "model": effective_model.stem,
            "output_path": str(output_param),
            "label_path": label_path,
            "wav_path": wav,
            "created_files": created,
            "cli_params": cli_params_from_engine(kwargs),
        }
    finally:
        if original_tqdm is not None:
            _restore_predict_tqdm(original_tqdm)
        if temp_csv is not None and temp_csv.is_file() and temp_csv != source:
            try:
                temp_csv.unlink()
            except OSError:
                pass


def run_filter_predictions(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.predict import filter_predictions_file

    predicted = params.get("predicted_labels") or params.get("predicted_labels_path")
    if not predicted:
        raise ValueError("predicted_labels (path to .txt) is required")

    msgr = _messenger(job_id, params, "Filtering predictions")
    job_params = dict(params)
    job_params["predicted_labels_path"] = predicted

    inject: dict[str, Any] = {"msgr": msgr}
    limits = resolve_call_duration_limits(params)
    if limits is not None:
        inject["call_duration_limits"] = limits
        msgr.info(f"Call duration limits: {limits}")

    kwargs = engine_kwargs(
        filter_predictions_file,
        job_params,
        required=("predicted_labels_path",),
        inject=inject,
        skip=frozenset({"call_duration_limits", "msgr"}),
    )

    filter_predictions_file(**kwargs)

    output_param = kwargs.get("output_file", "default")
    if str(output_param) == "default":
        label_file = resolve_filtered_output_path(predicted)
    else:
        label_file = Path(str(output_param)).resolve()

    label_path = str(label_file) if label_file.is_file() else None
    return {
        "predicted_labels": str(Path(predicted).resolve()),
        "output_file": str(output_param),
        "label_path": label_path,
        "created_files": collect_created(label_path),
        "cli_params": cli_params_from_engine(
            kwargs, predicted_labels=str(Path(predicted).resolve())
        ),
    }
