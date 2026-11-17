"""Hyperparameter-search merge helpers for training adapters."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.messenger import JobMessenger


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
