"""Training pipeline command adapters (orcAI steps 5–12) — engine defaults pass-through."""

from __future__ import annotations

import contextlib
import shutil
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.engine_call import (
    cli_params_from_engine,
    collect_created,
    engine_kwargs,
    snapshot_files,
)
from orcai_desktop_sidecar.messenger import JobMessenger


def _messenger(job_id: str, params: dict[str, Any], title: str) -> JobMessenger:
    verbosity = int(params["verbosity"]) if "verbosity" in params else 2
    return JobMessenger(job_id, verbosity=verbosity, title=title)


def _prepare_read_params(params: dict[str, Any]) -> dict[str, Any]:
    """Normalize aliases, then match ``-ct`` to shards already in ``data_dir``."""
    from orcai_desktop_sidecar.tvt_compression import align_dataset_compression

    return align_dataset_compression(_normalize_params(params))


def _normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(params)
    prepared.pop("project_dir", None)
    if prepared.get("compression_type") == "None":
        prepared["compression_type"] = None
    if "snippet_table_path" in prepared and "snippet_table" not in prepared:
        prepared["snippet_table"] = prepared.pop("snippet_table_path")
    if "tvt_snippet_tables_dir" in prepared and "tvt_dir" not in prepared:
        prepared["tvt_dir"] = prepared.pop("tvt_snippet_tables_dir")
    if "load_model" in prepared and isinstance(prepared["load_model"], str):
        prepared["load_model_from"] = prepared["load_model"]
        prepared["load_model"] = True
    return prepared


def abs_str(value: Any) -> str:
    return str(Path(str(value)).expanduser().resolve())


def _count_snippets_by_type(snippet_table: Path) -> dict[str, int]:
    """Row counts per data_type from all_snippets.csv.gz (or .csv) — raw, unfiltered."""
    import csv
    import gzip

    path = Path(snippet_table)
    if not path.is_file():
        return {}
    counts: dict[str, int] = {}
    open_fn = gzip.open if path.suffix == ".gz" or path.name.endswith(".csv.gz") else open
    mode = "rt"
    with open_fn(path, mode, newline="") as handle:  # type: ignore[arg-type]
        reader = csv.DictReader(handle)
        for row in reader:
            key = str(row.get("data_type") or "").strip() or "unknown"
            counts[key] = counts.get(key, 0) + 1
    return counts


def _counts_after_orcai_filter(
    snippet_table: Path,
    orcai_parameter: dict[str, Any],
    msgr: JobMessenger | None = None,
) -> dict[str, int]:
    """Counts per split after the same ``_filter_snippet_table`` orcAI applies.

    create_tvt_snippet_tables samples from the *filtered* table; clamping on raw
    counts overshoots when fraction_removal drops empty snippets.
    """
    import numpy as np
    import pandas as pd
    from orcai.auxiliary import Messenger
    from orcai.snippets import SEED_ID_FILTER_SNIPPET_TABLE, _filter_snippet_table

    path = Path(snippet_table)
    if not path.is_file():
        return {}
    table = pd.read_csv(path)
    calls = orcai_parameter.get("calls")
    if not isinstance(calls, list) or not calls:
        return {
            str(k): int(v)
            for k, v in table["data_type"].value_counts().to_dict().items()
        }
    missing = [c for c in calls if c not in table.columns]
    if missing:
        # Table shape unexpected — fall back to raw counts.
        return {
            str(k): int(v)
            for k, v in table["data_type"].value_counts().to_dict().items()
        }

    seed = orcai_parameter.get("seed")
    rng = np.random.default_rng(
        seed=[SEED_ID_FILTER_SNIPPET_TABLE, seed if seed is not None else 0]
    )
    quiet = msgr if msgr is not None else Messenger(verbosity=0)
    filtered = _filter_snippet_table(
        table,
        orcai_parameter=orcai_parameter,
        rng=rng,
        msgr=quiet,
    )
    return {
        str(k): int(v)
        for k, v in filtered["data_type"].value_counts().to_dict().items()
    }


def _clamp_n_batches_to_snippets(
    orcai_parameter: Any,
    snippet_table: Path | None,
    msgr: JobMessenger | None = None,
    *,
    strict: bool = False,
) -> Any:
    """Cap model.n_batch_* so n_batch * batch_size ≤ *filtered* snippets per split.

    When ``orcai_parameter`` is a JSON path and values change, write a temp copy
    (never rewrite the project ``-p``). Dict input returns the clamped dict.

    When ``strict`` (train path): raise if a split needs batches but has fewer than
    ``batch_size`` snippets after filter (board-only train without prior TVT clamp).
    """
    from orcai.io import read_json, write_json

    path: Path | None = None
    if isinstance(orcai_parameter, (str, Path)):
        path = Path(str(orcai_parameter)).expanduser()
        if not path.is_file():
            return orcai_parameter
        doc = read_json(path)
    elif isinstance(orcai_parameter, dict):
        doc = dict(orcai_parameter)
    else:
        return orcai_parameter

    model = doc.get("model")
    if not isinstance(model, dict):
        return doc if path is None else orcai_parameter

    try:
        batch_size = int(model.get("batch_size") or 0)
    except (TypeError, ValueError):
        batch_size = 0
    if batch_size <= 0:
        return doc if path is None else orcai_parameter

    if snippet_table is None or not snippet_table.is_file():
        return doc if path is None else orcai_parameter

    try:
        counts = _counts_after_orcai_filter(snippet_table, doc, msgr=msgr)
    except Exception:  # noqa: BLE001 — fall back to raw if filter path fails
        counts = _count_snippets_by_type(snippet_table)
    if not counts:
        return doc if path is None else orcai_parameter

    changed: list[str] = []
    for split in ("train", "val", "test"):
        key = f"n_batch_{split}"
        try:
            current = int(model.get(key) or 0)
        except (TypeError, ValueError):
            continue
        if current <= 0:
            continue
        available = int(counts.get(split, 0))
        max_batches = available // batch_size
        if max_batches < 1:
            if strict:
                raise ValueError(
                    f"Not enough {split} snippets after filter ({available}) "
                    f"for batch_size={batch_size} (need at least one full batch)."
                )
            continue
        if current > max_batches:
            model[key] = max_batches
            changed.append(f"{key}: {current}→{max_batches} ({available} after filter)")

    if not changed:
        return doc if path is None else orcai_parameter

    doc["model"] = model
    if msgr is not None:
        msgr.info(
            "Clamped n_batch_* to fit filtered snippet table: " + "; ".join(changed),
            indent=1,
        )
    # TRN-02: never rewrite the project's on-disk -p; pass a temp copy to the engine.
    if path is not None:
        import tempfile

        tmp_dir = Path(tempfile.mkdtemp(prefix="orcai_nbatch_clamp_"))
        tmp_path = tmp_dir / path.name
        write_json(doc, tmp_path)
        return str(tmp_path)
    return doc


def _rel_is_hidden(path: Path, root: Path) -> bool:
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        rel = path
    return any(part.startswith(".") for part in rel.parts)


def _find_best_hyperparameters_json(project_dir: Path | None) -> Path | None:
    """Newest ``best_hyperparameters.json`` under ``project/hpsearch/`` (orcAI hpsearch)."""
    if project_dir is None or not project_dir.is_dir():
        return None
    root = project_dir / "hpsearch"
    if not root.is_dir():
        return None
    candidates: list[Path] = []
    try:
        candidates = [
            p
            for p in root.rglob("best_hyperparameters.json")
            if p.is_file() and not _rel_is_hidden(p, root)
        ]
    except OSError:
        return None
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def _merge_best_hyperparameters_into_doc(
    doc: dict[str, Any],
    best: dict[str, Any],
    hps_parameter: dict[str, Any] | None,
) -> list[str]:
    """Apply KerasTuner best values into ``orcai_parameter`` model fields.

    ``filters`` in best is a set key (``set1``…); resolve via ``hps_parameter.filters``.
    Returns human-readable change lines for the job log.
    """
    model = doc.get("model")
    if not isinstance(model, dict):
        model = {}
        doc["model"] = model
    changed: list[str] = []
    filters_val = best.get("filters")
    if isinstance(filters_val, str) and hps_parameter:
        sets = hps_parameter.get("filters")
        if isinstance(sets, dict) and filters_val in sets:
            resolved = sets[filters_val]
            if isinstance(resolved, list) and resolved:
                model["filters"] = resolved
                changed.append(f"filters: {filters_val} → {resolved}")
    elif isinstance(filters_val, list) and filters_val:
        model["filters"] = filters_val
        changed.append(f"filters → {filters_val}")

    for key in ("kernel_size", "dropout_rate", "batch_size", "lstm_units"):
        if key not in best:
            continue
        val = best[key]
        if val is None:
            continue
        model[key] = val
        changed.append(f"{key} → {val}")
    return changed


def _apply_best_hyperparameters_before_train(
    orcai_parameter: Any,
    *,
    project_dir: Path | None,
    hps_parameter_path: Path | None,
    msgr: JobMessenger | None = None,
) -> Any:
    """QA-M2: merge hpsearch best into ``-p`` so the following train uses winners."""
    from orcai.io import read_json, write_json

    best_path = _find_best_hyperparameters_json(project_dir)
    if best_path is None:
        return orcai_parameter

    path: Path | None = None
    if isinstance(orcai_parameter, (str, Path)):
        path = Path(str(orcai_parameter)).expanduser()
        if not path.is_file():
            return orcai_parameter
        doc = read_json(path)
    elif isinstance(orcai_parameter, dict):
        doc = dict(orcai_parameter)
    else:
        return orcai_parameter
    if not isinstance(doc, dict):
        return orcai_parameter

    try:
        best = read_json(best_path)
    except Exception:  # noqa: BLE001 — optional path probe
        return orcai_parameter
    if not isinstance(best, dict) or not best:
        return orcai_parameter

    hps_doc: dict[str, Any] | None = None
    if hps_parameter_path is not None and hps_parameter_path.is_file():
        try:
            loaded = read_json(hps_parameter_path)
            if isinstance(loaded, dict):
                hps_doc = loaded
        except Exception:  # noqa: BLE001 — optional path probe
            hps_doc = None

    changed = _merge_best_hyperparameters_into_doc(doc, best, hps_doc)
    if not changed:
        return orcai_parameter

    if msgr is not None:
        msgr.info(
            f"Applied hpsearch best ({best_path.name}): " + "; ".join(changed),
            indent=1,
        )
    # Same contract as n_batch clamp: never rewrite the project's on-disk -p.
    # Upstream ``orcai train`` does not mutate -p from hpsearch artifacts.
    if path is not None:
        import tempfile

        tmp_dir = Path(tempfile.mkdtemp(prefix="orcai_hps_apply_"))
        tmp_path = tmp_dir / path.name
        write_json(doc, tmp_path)
        return str(tmp_path)
    return doc


def _run_with_artifacts(
    *,
    output: Path,
    call: Any,
) -> list[str]:
    """Return only files created under ``output`` (never a pre-existing input root)."""
    before = snapshot_files(output if output.exists() else None)
    call()
    if not output.exists():
        return []
    if output.is_file():
        return collect_created(output)
    return collect_created(before=before, root=output)


def run_create_spectrograms(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.spectrogram import create_spectrograms

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating spectrograms")
    kwargs = engine_kwargs(
        create_spectrograms,
        prepared,
        required=("recording_table_path", "output_dir"),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    created = _run_with_artifacts(output=out, call=lambda: create_spectrograms(**kwargs))
    return {
        "recording_table_path": abs_str(kwargs["recording_table_path"]),
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_create_label_arrays(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.labels import create_label_arrays

    prepared = _normalize_params(params)
    prepared.pop("call_equivalences_fallback", None)
    ce = prepared.get("call_equivalences")
    ce_path = Path(str(ce)).expanduser() if isinstance(ce, (str, Path)) else None
    if ce is None or (ce_path is not None and not ce_path.is_file()):
        fallback = params.get("call_equivalences_fallback")
        if isinstance(fallback, dict) and fallback:
            prepared["call_equivalences"] = fallback
        else:
            # Identity map from orcai_parameter.calls (orcAI requires equivalences to rename origlabel→label).
            orcai_parameter = prepared.get("orcai_parameter")
            calls: list[str] = []
            if isinstance(orcai_parameter, dict):
                raw = orcai_parameter.get("calls")
                if isinstance(raw, list):
                    calls = [str(x) for x in raw]
            elif orcai_parameter:
                try:
                    from orcai.io import read_json

                    doc = read_json(orcai_parameter)
                    raw = doc.get("calls") if isinstance(doc, dict) else None
                    if isinstance(raw, list):
                        calls = [str(x) for x in raw]
                except Exception:  # noqa: BLE001 — optional artifact scan
                    calls = []
            if calls:
                prepared["call_equivalences"] = {c: c for c in calls}
    msgr = _messenger(job_id, params, "Creating label arrays")
    kwargs = engine_kwargs(
        create_label_arrays,
        prepared,
        required=("recording_table_path", "output_dir"),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    created = _run_with_artifacts(output=out, call=lambda: create_label_arrays(**kwargs))
    return {
        "recording_table_path": abs_str(kwargs["recording_table_path"]),
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_create_snippet_table(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_snippet_table

    prepared = _normalize_params(params)
    if "output_path" in prepared and "output_dir" not in prepared:
        prepared["output_dir"] = prepared.pop("output_path")
    msgr = _messenger(job_id, params, "Creating snippet table")
    kwargs = engine_kwargs(
        create_snippet_table,
        prepared,
        required=("recording_table_path", "recording_data_dir"),
        inject={"msgr": msgr},
    )
    out = kwargs.get("output_dir")
    out_path = Path(str(out)).resolve() if out else None
    before = snapshot_files(out_path)
    create_snippet_table(**kwargs)
    created = collect_created(
        out_path if out_path and out_path.exists() else None,
        before=before,
        root=out_path,
    )
    return {
        "recording_table_path": abs_str(kwargs["recording_table_path"]),
        "recording_data_dir": abs_str(kwargs["recording_data_dir"]),
        "output_dir": str(out_path) if out_path else None,
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_create_tvt_snippet_tables(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_tvt_snippet_tables

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating TVT snippet tables")

    out_hint = prepared.get("output_dir")
    st = prepared.get("snippet_table")
    snippet_path: Path | None = None
    if isinstance(st, (str, Path)) and str(st).strip():
        snippet_path = Path(str(st)).expanduser()
    elif out_hint:
        candidate = Path(str(out_hint)).expanduser() / "all_snippets.csv.gz"
        if candidate.is_file():
            snippet_path = candidate

    if "orcai_parameter" in prepared:
        prepared["orcai_parameter"] = _clamp_n_batches_to_snippets(
            prepared.get("orcai_parameter"),
            snippet_path,
            msgr=msgr,
        )

    kwargs = engine_kwargs(
        create_tvt_snippet_tables,
        prepared,
        required=("output_dir",),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    created = _run_with_artifacts(
        output=out, call=lambda: create_tvt_snippet_tables(**kwargs)
    )
    return {
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def _drop_stale_dataset_shards(tvt_dir: Path) -> None:
    """Remove old ``data_*.tfrecord`` shards before orcAI rewrites a dataset.

    orcAI reuses the folder and writes shards from index 0, but loads every
    ``data_*.tfrecord`` it finds, so a smaller rebuild would mix in old shards.
    """
    if not tvt_dir.is_dir():
        return
    for snippets in tvt_dir.glob("*.csv.gz"):
        itype = snippets.name[: -len(".csv.gz")]
        dataset_dir = tvt_dir / f"{itype}_dataset"
        if not dataset_dir.is_dir():
            continue
        for shard in dataset_dir.glob("data_*.tfrecord"):
            shard.unlink(missing_ok=True)


def run_create_tvt_data(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.snippets import create_tvt_data

    prepared = _normalize_params(params)
    msgr = _messenger(job_id, params, "Creating TVT datasets")
    kwargs = engine_kwargs(
        create_tvt_data,
        prepared,
        required=("tvt_dir",),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["tvt_dir"])).resolve()
    if kwargs.get("overwrite"):
        _drop_stale_dataset_shards(out)
    import orcai.snippets as orcai_snippets

    # orcAI appends "test_unfiltered" to the module-level DATA_TYPES list.
    data_types_before = list(orcai_snippets.DATA_TYPES)
    try:
        created = _run_with_artifacts(
            output=out, call=lambda: create_tvt_data(**kwargs)
        )
    finally:
        orcai_snippets.DATA_TYPES[:] = data_types_before
    return {
        "tvt_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_hpsearch(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.hpsearch import hyperparameter_search

    prepared = _prepare_read_params(params)
    msgr = _messenger(job_id, params, "Hyperparameter search")
    kwargs = engine_kwargs(
        hyperparameter_search,
        prepared,
        required=("data_dir", "output_dir"),
        inject={"msgr": msgr},
    )
    # orcAI ``hyperparameter_search`` calls ``data_dir.joinpath`` without coercing
    # Path (unlike ``train``). Job params are strings from the Desktop UI.
    kwargs["data_dir"] = Path(str(kwargs["data_dir"])).expanduser().resolve()
    kwargs["output_dir"] = Path(str(kwargs["output_dir"])).expanduser().resolve()
    if kwargs.get("hps_parameter") is not None:
        kwargs["hps_parameter"] = (
            Path(str(kwargs["hps_parameter"])).expanduser().resolve()
        )
    out = kwargs["output_dir"]
    if prepared.get("overwrite"):
        logs = Path(out) / "hps_logs"
        if logs.is_dir():
            shutil.rmtree(logs, ignore_errors=True)
        best = Path(out) / "best_hyperparameters.json"
        best.unlink(missing_ok=True)
    created = _run_with_artifacts(
        output=out, call=lambda: hyperparameter_search(**kwargs)
    )
    return {
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


def run_train(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.train import train

    from orcai_desktop_sidecar.train_live import install_train_fit_hook

    prepared = _prepare_read_params(params)
    msgr = _messenger(job_id, params, "Training model")
    project_dir_raw = params.get("project_dir")
    project_dir = (
        Path(str(project_dir_raw)).expanduser()
        if isinstance(project_dir_raw, (str, Path)) and str(project_dir_raw).strip()
        else None
    )
    # Finetune keeps base network shape — do not overwrite with hpsearch winners.
    # TRN-01: merge only when the job opts in (wizard/board after hpsearch).
    is_finetune = bool(
        prepared.get("load_model") or prepared.get("load_model_from")
    )
    apply_best = bool(prepared.get("apply_best_hyperparameters"))
    if (
        apply_best
        and not is_finetune
        and "orcai_parameter" in prepared
        and project_dir is not None
    ):
        hps_hint = prepared.get("hps_parameter")
        hps_path: Path | None = None
        if isinstance(hps_hint, (str, Path)) and str(hps_hint).strip():
            candidate = Path(str(hps_hint)).expanduser()
            if candidate.is_file():
                hps_path = candidate
        if hps_path is None and project_dir.is_dir():
            # Newest wizard/manual *_hps_parameter.json in the project root.
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
                hps_path = matches[0] if matches else None
            except OSError:
                hps_path = None
        prepared["orcai_parameter"] = _apply_best_hyperparameters_before_train(
            prepared.get("orcai_parameter"),
            project_dir=project_dir,
            hps_parameter_path=hps_path,
            msgr=msgr,
        )
    # Clamp n_batch for live monitor / temp -p when snippets still exist, but do
    # not invent a hard fail: orcAI train() loads TF datasets and does not
    # re-check snippet inventory (create-tvt uses non-strict clamp + orcAI ValueError).
    data_hint = prepared.get("data_dir")
    snippet_path: Path | None = None
    if isinstance(data_hint, (str, Path)) and str(data_hint).strip():
        root = Path(str(data_hint)).expanduser()
        for name in ("all_snippets.csv.gz", "all_snippets.csv"):
            candidate = root / name
            if candidate.is_file():
                snippet_path = candidate
                break
    if "orcai_parameter" in prepared:
        prepared["orcai_parameter"] = _clamp_n_batches_to_snippets(
            prepared.get("orcai_parameter"),
            snippet_path,
            msgr=msgr,
            strict=False,
        )
    kwargs = engine_kwargs(
        train,
        prepared,
        required=("data_dir", "output_dir"),
        inject={"msgr": msgr},
    )
    out = Path(str(kwargs["output_dir"])).resolve()
    # Resolve parameter for live monitor (name / epochs / monitor metric).
    orcai_parameter = kwargs.get("orcai_parameter")
    parameter: dict[str, Any] = {}
    if isinstance(orcai_parameter, dict):
        parameter = orcai_parameter
    elif orcai_parameter is not None:
        try:
            from orcai.io import read_json

            loaded = read_json(orcai_parameter)
            if isinstance(loaded, dict):
                parameter = loaded
        except Exception:  # noqa: BLE001 — optional metadata read
            parameter = {}
    model = parameter.get("model") if isinstance(parameter.get("model"), dict) else {}
    model_name = str(parameter.get("name") or "model").strip() or "model"
    model_dir = out / model_name
    epochs = int(model.get("epochs") or 30)
    # orcAI model.n_batch_train = batches per epoch (not samples).
    n_batch = int(model.get("n_batch_train") or 0)
    batches = n_batch if n_batch > 0 else None
    monitor = str(model.get("monitor") or "val_MBA")
    early_pat = int(
        model.get("EarlyStopping_patience") or model.get("early_stopping_patience") or 0
    )
    restore_fit = install_train_fit_hook(
        job_id=job_id,
        model_dir=model_dir,
        epochs=epochs,
        batches_per_epoch=batches,
        monitor_metric=monitor,
        early_stopping_patience=early_pat if early_pat > 0 else None,
    )
    try:
        created = _run_with_artifacts(output=out, call=lambda: train(**kwargs))
    finally:
        with contextlib.suppress(Exception):
            restore_fit()
    return {
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out),
        "model_dir": str(model_dir),
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }


from orcai_desktop_sidecar.model_paths import resolve_trained_model_dir


def _read_json_dict(path: Path) -> dict[str, Any] | None:
    import json

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _calls_of(param: dict[str, Any] | None) -> list[str]:
    raw = (param or {}).get("calls")
    if not isinstance(raw, list):
        return []
    return [str(c).strip().upper() for c in raw if str(c).strip()]


def _check_test_class_layout(prepared: dict[str, Any], msgr: Any) -> None:
    """Refuse a test whose label width differs from the model's class count.

    orcAI scores label column *i* against model output *i*; a different count
    fails deep in Keras, a different order silently swaps per-class metrics.
    """
    model_dir = prepared.get("model_dir")
    data_dir = prepared.get("data_dir")
    if not model_dir or not data_dir:
        return
    model_calls = _calls_of(_read_json_dict(Path(str(model_dir)) / "orcai_parameter.json"))
    if not model_calls:
        return
    for split in ("test_dataset", ""):
        shapes = _read_json_dict(Path(str(data_dir)) / split / "dataset_shapes.json")
        labels = (shapes or {}).get("labels")
        if isinstance(labels, list) and labels and isinstance(labels[-1], int):
            if labels[-1] != len(model_calls):
                raise ValueError(
                    f"Dataset has {labels[-1]} classes, model has {len(model_calls)} "
                    f"({', '.join(model_calls)}). Rebuild tvt_data with the model's classes."
                )
            break
    project_param = prepared.get("orcai_parameter")
    if isinstance(project_param, str) and project_param:
        project_calls = _calls_of(_read_json_dict(Path(project_param)))
        if (
            project_calls
            and len(project_calls) == len(model_calls)
            and project_calls != model_calls
            and set(project_calls) == set(model_calls)
        ):
            msgr.warning(
                "Class order differs between the project parameter and the model: "
                f"project={project_calls} model={model_calls}. "
                "Per-class metrics follow the order the dataset was built with."
            )


def run_test(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    from orcai.test_models import test_model

    prepared = _prepare_read_params(params)
    raw_model = prepared.get("model_dir")
    if raw_model:
        prepared["model_dir"] = str(resolve_trained_model_dir(raw_model))
    msgr = _messenger(
        job_id,
        params,
        f"Testing model {Path(str(prepared.get('model_dir', '') or '')).name}",
    )
    data_dir_raw = prepared.get("data_dir")
    unfiltered_dir = (
        Path(str(data_dir_raw)) / "test_unfiltered_dataset" if data_dir_raw else None
    )
    if unfiltered_dir is not None and not (unfiltered_dir / "dataset_shapes.json").is_file():
        # orcAI defaults test_unfiltered=True and crashes after the main test
        # when the unfiltered dataset was never built.
        if prepared.get("test_unfiltered", True):
            msgr.warning(
                f"{unfiltered_dir} not found — skipping the unfiltered test set."
            )
        prepared["test_unfiltered"] = False
    _check_test_class_layout(prepared, msgr)
    kwargs = engine_kwargs(
        test_model,
        prepared,
        required=("model_dir", "data_dir"),
        inject={"msgr": msgr},
    )
    model_dir = Path(str(kwargs["model_dir"])).resolve()
    out = kwargs.get("output_dir")
    explicit_out = out is not None and str(out) not in ("", "default")
    # When -o is omitted, orcAI writes under model_dir — collect only *new* files,
    # never the input model_dir itself.
    out_path = Path(str(out)).resolve() if explicit_out else model_dir
    before = snapshot_files(out_path if out_path.exists() else None)
    test_model(**kwargs)
    if explicit_out and out_path.exists() and out_path.is_file():
        created = collect_created(out_path)
    else:
        created = collect_created(
            before=before, root=out_path if out_path.exists() else None
        )
    # Belt-and-suspenders: never report the input model tree as a created artifact.
    model_resolved = str(model_dir.resolve())
    created = [p for p in created if p != model_resolved]
    return {
        "model_dir": str(model_dir),
        "data_dir": abs_str(kwargs["data_dir"]),
        "output_dir": str(out_path) if explicit_out else None,
        "created_files": created,
        "cli_params": cli_params_from_engine(kwargs),
    }
