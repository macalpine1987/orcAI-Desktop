"""Models studio — list enrichment, card detail, compatibility, import."""

from __future__ import annotations

import contextlib
import csv
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.models import (
    _model_dir_has_weights,
    _parameter_calls,
    _parameter_label_name,
    list_builtin_models,
    list_trained_models,
)

# Spectrogram keys compared for project ↔ model compatibility (FR-9).
_SPECTRO_COMPARE_KEYS = (
    "sampling_rate",
    "nfft",
    "n_overlap",
    "freq_range",
    "quantiles",
    "duration",
)


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _dir_size_bytes(model_dir: Path) -> int:
    total = 0
    try:
        for p in model_dir.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    continue
    except OSError:
        return 0
    return total


def _keras_or_h5(model_dir: Path) -> Path | None:
    keras = sorted(model_dir.glob("*.keras"))
    if keras:
        return keras[0]
    h5 = sorted(model_dir.glob("*.h5"))
    return h5[0] if h5 else None


def _best_val_mba(model_dir: Path) -> float | None:
    hist = _read_json(model_dir / "training_history.json")
    if not hist:
        return None
    series = hist.get("val_MBA")
    if not isinstance(series, list) or not series:
        return None
    nums = [float(x) for x in series if isinstance(x, (int, float))]
    return max(nums) if nums else None


def _trained_at_iso(model_dir: Path, kind: str) -> str | None:
    if kind == "builtin":
        return None
    candidates: list[Path] = []
    weights = _keras_or_h5(model_dir)
    if weights:
        candidates.append(weights)
    hist = model_dir / "training_history.json"
    if hist.is_file():
        candidates.append(hist)
    if not candidates:
        return None
    try:
        mtime = max(p.stat().st_mtime for p in candidates)
    except OSError:
        return None
    return datetime.fromtimestamp(mtime, tz=UTC).isoformat()


def _rel_display_path(model_dir: Path, project_dir: Path | None) -> str:
    if project_dir is None:
        return str(model_dir)
    try:
        rel = model_dir.resolve().relative_to(project_dir.resolve())
        return str(rel).replace("\\", "/")
    except ValueError:
        return str(model_dir)


def project_parameter_path(project_dir: Path) -> Path | None:
    """Prefer ``<folder>_orcai_parameter.json`` then any ``*_orcai_parameter.json``.

    Does **not** use the project display name — callers must pass the on-disk
    project directory so Test preflight matches compatibility / pipeline.
    """
    root = Path(project_dir).expanduser()
    direct = root / f"{root.name}_orcai_parameter.json"
    if direct.is_file():
        return direct
    matches = sorted(root.glob("*_orcai_parameter.json"))
    return matches[0] if matches else None


# Back-compat alias used inside this module.
_project_parameter_path = project_parameter_path


def _load_parameter(model_dir: Path) -> dict[str, Any]:
    return _read_json(model_dir / "orcai_parameter.json") or {}


def _list_catalog_files(model_dir: Path) -> list[dict[str, str]]:
    """Card file list: weights, parameter, shape, history, test/."""
    out: list[dict[str, str]] = []
    weights = _keras_or_h5(model_dir)
    if weights:
        out.append({"name": weights.name, "role": "weights"})
    for name, role in (
        ("orcai_parameter.json", "parameter"),
        ("model_shape.json", "shape"),
        ("training_history.json", "history"),
        ("history.csv", "history_csv"),
    ):
        if (model_dir / name).is_file():
            out.append({"name": name, "role": role})
    test_dir = model_dir / "test"
    if test_dir.is_dir():
        out.append({"name": "test/", "role": "test"})
    return out


def _confusion_cell(raw: dict[str, Any], key: str) -> float | None:
    value = raw.get(key)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_confusion_csv(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    try:
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for raw in reader:
                label = (raw.get("Label") or raw.get("label") or "").strip()
                if not label:
                    continue
                total = _confusion_cell(raw, "Total")
                rows.append(
                    {
                        "label": label,
                        "precision": _confusion_cell(raw, "PR"),
                        "recall": _confusion_cell(raw, "RE"),
                        "f1": _confusion_cell(raw, "F1"),
                        "tp": _confusion_cell(raw, "TP"),
                        "fn": _confusion_cell(raw, "FN"),
                        "fp": _confusion_cell(raw, "FP"),
                        "tn": _confusion_cell(raw, "TN"),
                        "total": int(total or 0),
                    }
                )
    except OSError:
        return []
    return rows


def _macro_avg(rows: list[dict[str, Any]], key: str) -> float | None:
    vals = [
        float(r[key])
        for r in rows
        if isinstance(r.get(key), (int, float)) and r[key] == r[key]
    ]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _load_test_bundle(model_dir: Path) -> dict[str, Any] | None:
    """Prefer ``test_data_*`` over unfiltered."""
    test_dir = model_dir / "test"
    if not test_dir.is_dir():
        return None
    for stem in ("test_data", "test_unfiltered_dataset"):
        metrics_path = test_dir / f"{stem}_metrics.json"
        confusion_path = test_dir / f"{stem}_confusion_table.csv"
        if not metrics_path.is_file():
            continue
        metrics = _read_json(metrics_path) or {}
        classes = _parse_confusion_csv(confusion_path)
        mba = metrics.get("MBA")
        try:
            mba_f = float(mba) if mba is not None else None
        except (TypeError, ValueError):
            mba_f = None
        if mba_f is not None and mba_f != mba_f:
            mba_f = None
        loss_raw = metrics.get("loss")
        try:
            loss_f = float(loss_raw) if isinstance(loss_raw, (int, float)) else None
        except (TypeError, ValueError):
            loss_f = None
        if loss_f is not None and loss_f != loss_f:
            loss_f = None
        return {
            "dataset": stem,
            "metrics_path": str(metrics_path),
            "confusion_path": str(confusion_path) if confusion_path.is_file() else None,
            "mba": mba_f,
            "loss": loss_f,
            "precision": _macro_avg(classes, "precision"),
            "recall": _macro_avg(classes, "recall"),
            "f1": _macro_avg(classes, "f1"),
            "classes": classes,
        }
    return None


def _values_close(a: Any, b: Any, tol: float = 1e-6) -> bool:
    if a == b:
        return True
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= tol
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        if len(a) != len(b):
            return False
        return all(_values_close(x, y, tol) for x, y in zip(a, b, strict=False))
    return False


def compare_compatibility(
    model_dir: Path,
    project_dir: Path,
) -> dict[str, Any]:
    """Spectrogram + calls vs project ``*_orcai_parameter.json``."""
    model_param = _load_parameter(model_dir)
    project_param_path = _project_parameter_path(project_dir)
    project_param = _read_json(project_param_path) if project_param_path else None

    issues: list[dict[str, str]] = []
    if project_param is None:
        return {
            "ok": True,
            "checked": False,
            "reason": "no_project_parameter",
            "issues": [],
            "project_parameter": None,
        }

    m_spec = model_param.get("spectrogram")
    p_spec = project_param.get("spectrogram")
    if isinstance(m_spec, dict) and isinstance(p_spec, dict):
        for key in _SPECTRO_COMPARE_KEYS:
            if key not in m_spec or key not in p_spec:
                continue
            if not _values_close(m_spec.get(key), p_spec.get(key)):
                issues.append(
                    {
                        "code": "spectrogram_mismatch",
                        "field": key,
                        "detail": f"{key}: model={m_spec.get(key)!r} project={p_spec.get(key)!r}",
                    }
                )
    elif isinstance(m_spec, dict) or isinstance(p_spec, dict):
        issues.append(
            {
                "code": "spectrogram_missing",
                "field": "spectrogram",
                "detail": "spectrogram block missing on model or project",
            }
        )

    m_calls = [
        str(c).strip()
        for c in (model_param.get("calls") or [])
        if str(c).strip()
    ]
    p_calls = [
        str(c).strip()
        for c in (project_param.get("calls") or [])
        if str(c).strip()
    ]
    if m_calls and p_calls:
        model_set = {c.upper() for c in m_calls}
        project_set = {c.upper() for c in p_calls}
        if len(m_calls) != len(p_calls):
            issues.append(
                {
                    "code": "class_count_mismatch",
                    "field": "calls",
                    "detail": f"model={len(m_calls)} project={len(p_calls)}",
                }
            )
        if [c.upper() for c in m_calls] != [c.upper() for c in p_calls] and model_set == project_set:
            issues.append(
                {
                    "code": "class_order_mismatch",
                    "field": "calls",
                    "detail": f"model={m_calls} project={p_calls}",
                }
            )
        for c in p_calls:
            if c.upper() not in model_set:
                issues.append(
                    {
                        "code": "class_not_in_model",
                        "field": "calls",
                        "detail": c,
                    }
                )

    return {
        "ok": len(issues) == 0,
        "checked": True,
        "reason": None if issues else "compatible",
        "issues": issues,
        "project_parameter": str(project_param_path) if project_param_path else None,
        "model_calls": m_calls,
        "project_calls": p_calls,
    }


def enrich_model_row(
    row: dict[str, Any],
    project_dir: Path | None = None,
) -> dict[str, Any]:
    model_dir = Path(str(row["path"]))
    kind = str(row.get("kind") or "trained")
    calls = row.get("calls")
    if not isinstance(calls, list):
        calls = _parameter_calls(model_dir)
    out = dict(row)
    out["calls"] = calls
    out["class_count"] = len(calls)
    out["val_mba"] = _best_val_mba(model_dir)
    out["size_bytes"] = _dir_size_bytes(model_dir)
    out["trained_at"] = _trained_at_iso(model_dir, kind)
    out["display_path"] = _rel_display_path(model_dir, project_dir)
    out["has_test"] = (model_dir / "test").is_dir() and any(
        (model_dir / "test").glob("*_metrics.json")
    )
    return out


def list_models_studio(project_dir: str | Path | None = None) -> list[dict[str, Any]]:
    root = Path(project_dir) if project_dir else None
    rows: list[dict[str, Any]] = []
    with contextlib.suppress(Exception):
        rows.extend(list_builtin_models())
    if root is not None:
        rows.extend(list_trained_models(root))
    return [enrich_model_row(r, root) for r in rows]


def resolve_model_dir(
    model_id: str,
    project_dir: str | Path | None = None,
) -> Path | None:
    """Resolve builtin id or absolute/relative trained path."""
    needle = (model_id or "").strip()
    if not needle:
        return None
    as_path = Path(needle).expanduser()
    if as_path.is_dir() and _model_dir_has_weights(as_path):
        return as_path.resolve()

    for m in list_builtin_models():
        if m["id"] == needle or m["name"] == needle or m["path"] == needle:
            return Path(m["path"])

    if project_dir:
        root = Path(project_dir)
        for m in list_trained_models(root):
            if (
                m["id"] == needle
                or m["name"] == needle
                or m["path"] == needle
                or Path(m["path"]).name == needle
            ):
                return Path(m["path"])
        candidate = root / "models" / needle
        if candidate.is_dir() and _model_dir_has_weights(candidate):
            return candidate.resolve()
    return None


def get_model_detail(
    model_id: str,
    project_dir: str | Path | None = None,
) -> dict[str, Any]:
    root = Path(project_dir) if project_dir else None
    model_dir = resolve_model_dir(model_id, root)
    if model_dir is None:
        raise FileNotFoundError(f"Model not found: {model_id}")

    # Kind / id from catalogue when possible
    kind = "trained"
    catalog_id = str(model_dir)
    name = _parameter_label_name(model_dir)
    description = ""
    for m in list_builtin_models():
        if Path(m["path"]).resolve() == model_dir.resolve() or m["id"] == model_id:
            kind = "builtin"
            catalog_id = m["id"]
            name = m["name"]
            description = str(m.get("description") or "")
            break
    else:
        if root:
            for m in list_trained_models(root):
                if Path(m["path"]).resolve() == model_dir.resolve():
                    catalog_id = m["id"]
                    name = m["name"]
                    break

    param = _load_parameter(model_dir)
    shape = _read_json(model_dir / "model_shape.json")
    spectro = param.get("spectrogram") if isinstance(param.get("spectrogram"), dict) else {}
    model_block = param.get("model") if isinstance(param.get("model"), dict) else {}
    snippets = param.get("snippets") if isinstance(param.get("snippets"), dict) else {}
    # orcAI often stores snippet length only under spectrogram.duration — mirror into
    # snippets so Desktop finetune inheritance (INV-2) can lock the input shape.
    if "snippet_duration" not in snippets and isinstance(spectro.get("duration"), (int, float)):
        snippets = {**snippets, "snippet_duration": spectro["duration"]}
    calls = _parameter_calls(model_dir) or [
        str(c).strip() for c in (param.get("calls") or []) if str(c).strip()
    ]
    test = _load_test_bundle(model_dir)
    compat = (
        compare_compatibility(model_dir, root)
        if root is not None
        else {
            "ok": True,
            "checked": False,
            "reason": "no_project",
            "issues": [],
        }
    )

    return {
        "id": catalog_id,
        "name": name,
        "path": str(model_dir),
        "display_path": _rel_display_path(model_dir, root),
        "kind": kind,
        "description": description,
        "calls": calls,
        "class_count": len(calls),
        "val_mba": _best_val_mba(model_dir),
        "size_bytes": _dir_size_bytes(model_dir),
        "trained_at": _trained_at_iso(model_dir, kind),
        "files": _list_catalog_files(model_dir),
        "spectrogram": spectro,
        "snippets": snippets,
        "model": model_block,
        "architecture": param.get("architecture"),
        "shape": shape,
        "has_test": test is not None,
        "test": test,
        "compatibility": compat,
    }


def import_model_directory(
    source_dir: str | Path,
    project_dir: str | Path,
    dest_name: str | None = None,
) -> dict[str, Any]:
    """Copy a valid model catalogue into ``project/models/<name>/``."""
    src = Path(source_dir).expanduser().resolve()
    root = Path(project_dir).expanduser().resolve()
    if not src.is_dir():
        raise FileNotFoundError(f"Source model directory missing: {src}")
    if not _model_dir_has_weights(src):
        raise ValueError(
            "Source is not a valid orcAI model directory "
            "(need orcai_parameter.json and *.keras / *.h5)"
        )
    name = (dest_name or _parameter_label_name(src) or src.name).strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError("Invalid destination model name")
    dest = root / "models" / name
    if dest.exists():
        raise FileExistsError(f"Model already exists: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)
    row = enrich_model_row(
        {
            "id": str(dest),
            "name": _parameter_label_name(dest),
            "path": str(dest),
            "kind": "trained",
            "calls": _parameter_calls(dest),
        },
        root,
    )
    return {"model": row}


def export_model_directory(
    model_id: str,
    dest_parent: str | Path,
    project_dir: str | Path | None = None,
    dest_name: str | None = None,
) -> dict[str, Any]:
    """Copy a project-trained model catalogue to ``dest_parent/<name>/`` for transfer."""
    from orcai_desktop_sidecar.adapters.models import list_builtin_models

    root = Path(project_dir).expanduser().resolve() if project_dir else None
    model_dir = resolve_model_dir(model_id, root)
    if model_dir is None:
        raise FileNotFoundError(f"Model not found: {model_id}")
    model_dir = model_dir.resolve()
    for builtin in list_builtin_models():
        try:
            builtin_path = Path(builtin["path"]).resolve()
        except OSError:
            continue
        if builtin_path == model_dir or builtin["id"] == model_id:
            raise ValueError("Built-in models cannot be exported")
    if not _model_dir_has_weights(model_dir):
        raise ValueError(
            "Source is not a valid orcAI model directory "
            "(need orcai_parameter.json and *.keras / *.h5)"
        )
    parent = Path(dest_parent).expanduser().resolve()
    if not parent.is_dir():
        raise FileNotFoundError(f"Destination folder missing: {parent}")
    name = (dest_name or _parameter_label_name(model_dir) or model_dir.name).strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError("Invalid destination model name")
    dest = parent / name
    if dest.exists():
        raise FileExistsError(f"Model already exists: {dest}")
    shutil.copytree(model_dir, dest)
    return {
        "path": str(dest),
        "name": _parameter_label_name(dest),
        "files": _list_catalog_files(dest),
    }
