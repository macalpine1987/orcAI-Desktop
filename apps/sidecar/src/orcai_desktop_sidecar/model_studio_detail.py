"""Model detail + project compatibility (extracted from model_studio_list)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.adapters.models import (
    _parameter_calls,
    _parameter_label_name,
    list_builtin_models,
    list_trained_models,
)
from orcai_desktop_sidecar.model_studio_list import (
    _SPECTRO_COMPARE_KEYS,
    _best_val_mba,
    _dir_size_bytes,
    _list_catalog_files,
    _load_parameter,
    _load_test_bundle,
    _read_json,
    _rel_display_path,
    _trained_at_iso,
    _values_close,
    project_parameter_path as _project_parameter_path,
    resolve_model_dir,
)

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


