"""Built-in model discovery."""

from __future__ import annotations

from importlib.resources import as_file, files
from pathlib import Path
from typing import Any

# Human-readable hints (UI also has i18n keys under models.builtinDesc.*).
BUILTIN_DESCRIPTIONS: dict[str, str] = {
    "orcai-isl-v1": "Pre-trained for Iceland herring-feeding killer whale recordings.",
    "orcai-nor-v1": (
        "orcai-isl-v1 fine-tuned on Norwegian (Nor7) data for thirty epochs."
    ),
}


def _parameter_label_name(model_dir: Path) -> str:
    from orcai.io import read_json

    param_path = model_dir / "orcai_parameter.json"
    if param_path.is_file():
        return str(read_json(param_path)["name"])
    return model_dir.name


def _parameter_calls(model_dir: Path) -> list[str]:
    """Class list from ``orcai_parameter.json`` (predict / train parameter)."""
    from orcai.io import read_json

    param_path = model_dir / "orcai_parameter.json"
    if not param_path.is_file():
        return []
    try:
        data = read_json(param_path)
    except Exception:  # noqa: BLE001 — model probe optional in tests
        return []
    if not isinstance(data, dict):
        return []
    raw = data.get("calls")
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        name = str(item).strip()
        if name:
            out.append(name)
    return out


def _model_dir_has_weights(model_dir: Path) -> bool:
    if not (model_dir / "orcai_parameter.json").is_file():
        return False
    return any(model_dir.glob("*.keras")) or any(model_dir.glob("*.h5"))


def _resolve_entry_path(entry: object) -> Path | None:
    try:
        with as_file(entry) as resolved:
            return Path(resolved)
    except (TypeError, FileNotFoundError, OSError):
        candidate = Path(str(entry))
        return candidate if candidate.is_dir() else None


def list_builtin_models() -> list[dict[str, Any]]:
    root = files("orcai.models")
    models: list[dict[str, Any]] = []
    for entry in root.iterdir():
        model_dir = _resolve_entry_path(entry)
        if model_dir is None or not model_dir.is_dir():
            continue
        name = model_dir.name
        if name.startswith("."):
            continue
        if not _model_dir_has_weights(model_dir):
            continue
        label_name = _parameter_label_name(model_dir)
        models.append(
            {
                "id": name,
                "name": label_name,
                "path": str(model_dir),
                "kind": "builtin",
                "description": BUILTIN_DESCRIPTIONS.get(name, ""),
                "calls": _parameter_calls(model_dir),
            }
        )
    return sorted(models, key=lambda m: m["id"])


def verify_builtin_models_bundle() -> list[dict[str, Any]]:
    """Fail the release build if the app bundle has no complete built-in models."""
    models = list_builtin_models()
    if not models:
        msg = (
            "No built-in orcAI models found in orcai.models. "
            "Ensure orcAI is installed with model weights before bundling."
        )
        raise RuntimeError(msg)
    return models


def list_trained_models(project_dir: str | Path) -> list[dict[str, Any]]:
    root = Path(project_dir)
    candidates = [
        root / "models",
        root / "output",
        root,
    ]
    models: list[dict[str, Any]] = []
    seen: set[str] = set()

    for base in candidates:
        if not base.is_dir():
            continue
        for path in base.rglob("orcai_parameter.json"):
            model_dir = path.parent
            if not _model_dir_has_weights(model_dir):
                continue
            key = str(model_dir.resolve())
            if key in seen:
                continue
            seen.add(key)
            models.append(
                {
                    "id": key,
                    "name": _parameter_label_name(model_dir),
                    "path": key,
                    "kind": "trained",
                    "calls": _parameter_calls(model_dir),
                }
            )
    return sorted(models, key=lambda m: m["id"])


def list_all_models(project_dir: str | Path | None = None) -> list[dict[str, Any]]:
    models = list_builtin_models()
    if project_dir:
        trained = list_trained_models(project_dir)
        for m in trained:
            models.append(m)
    return models
