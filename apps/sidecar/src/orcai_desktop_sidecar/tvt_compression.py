"""Match orcAI ``-ct`` to TFRecord shards already on disk.

``test``, ``train`` and ``hpsearch`` only *read* ``tvt_data``. orcAI's CLI default
is GZIP, but a dataset written with ``compression_type=None`` is plain TFRecord.
Passing GZIP then fails in TensorFlow with ``incorrect header check``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

_GZIP_MAGIC = b"\x1f\x8b"
_SHARD_DIRS = (
    "test_dataset",
    "test_unfiltered_dataset",
    "val_dataset",
    "train_dataset",
)
# Commands that read existing shards. create-tvt-data *writes* them and must
# keep the compression the caller asked for.
READ_COMMANDS = frozenset({"test", "train", "hpsearch"})


def sniff_tfrecord_compression(path: Path) -> str | None:
    """Return ``GZIP`` or ``None`` (orcAI token) from a shard header."""
    try:
        with path.open("rb") as handle:
            magic = handle.read(2)
    except OSError:
        return None
    if len(magic) < 2:
        return None
    if magic == _GZIP_MAGIC:
        return "GZIP"
    return "None"


def detect_tvt_compression(data_dir: Path) -> str | None:
    """Return ``GZIP`` or ``None`` when a shard exists, otherwise unknown."""
    root = Path(data_dir)
    if not root.is_dir():
        return None
    shards: list[Path] = []
    for name in _SHARD_DIRS:
        folder = root / name
        if folder.is_dir():
            shards.extend(sorted(folder.glob("*.tfrecord")))
    if not shards:
        shards.extend(sorted(root.glob("*.tfrecord")))
    for shard in shards:
        kind = sniff_tfrecord_compression(shard)
        if kind is not None:
            return kind
    return None


def align_dataset_compression(params: dict[str, Any]) -> dict[str, Any]:
    """Copy ``params`` and set ``compression_type`` from the shards, when found."""
    out = dict(params)
    raw = out.get("data_dir")
    if not isinstance(raw, str) or not raw.strip():
        return out
    detected = detect_tvt_compression(Path(raw))
    if detected is None:
        return out
    out["compression_type"] = None if detected == "None" else detected
    return out
