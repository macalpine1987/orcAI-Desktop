"""Paths for trained orcAI model directories (no TensorFlow / orcAI import)."""

from __future__ import annotations

from pathlib import Path


def resolve_trained_model_dir(model_dir: Path | str) -> Path:
    """Directory that contains ``orcai_parameter.json`` + ``*.keras``.

    orcAI ``train`` writes to ``output_dir / parameter["name"]``. Older Desktop
    builds passed ``models/<name>`` as train ``output_dir``, producing a nested
    ``models/<name>/<name>/``. Accept both layouts for ``test``.
    """
    root = Path(str(model_dir)).expanduser().resolve()
    if (root / "orcai_parameter.json").is_file():
        return root
    if not root.is_dir():
        return root
    children = [
        child
        for child in sorted(root.iterdir())
        if child.is_dir() and (child / "orcai_parameter.json").is_file()
    ]
    if not children:
        return root
    for child in children:
        if child.name == root.name:
            return child
    return children[0]
