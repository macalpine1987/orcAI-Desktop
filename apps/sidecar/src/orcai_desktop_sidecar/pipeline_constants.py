"""Shared constants for the training pipeline board."""

from __future__ import annotations

from pathlib import Path

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

_TVT_SPLITS = ("train", "val", "test")
_STALE_SPEC_STEPS = frozenset({"create-spectrograms", "create-label-arrays"})
_STALE_SNIPPET_STEPS = frozenset(
    {"create-snippet-table", "create-tvt-snippet-tables", "create-tvt-data"}
)
_PARAM_FPS_REL = Path(".orcai_desktop") / "pipeline_param_fps.json"
_BUSY = frozenset({STATUS_BLOCKED, STATUS_RUNNING, STATUS_QUEUED})
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
