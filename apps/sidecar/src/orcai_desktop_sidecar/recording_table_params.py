"""Normalize create-recording-table job params (no orcAI import)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def recording_table_backup_path(table: Path) -> Path:
    """Side copy of the CSV held while orcAI rebuilds or merges the table."""
    return table.with_name(f".{table.name}.orcai-desktop-update-src")


def restore_recording_table_backup(table: Path) -> bool:
    """Put the pre-sync CSV back over a missing or partial output."""
    backup = recording_table_backup_path(table)
    if not backup.is_file():
        return False
    try:
        os.replace(backup, table)
    except OSError:
        return False
    return True


def resolve_update_table_path(
    params: dict[str, Any],
    output_path: Path,
) -> Path | None:
    """orcAI expects update_table to be a CSV path, not a boolean flag."""
    raw = params.get("update_table")
    if raw is None or raw is False:
        return None
    if raw is True:
        return output_path if output_path.is_file() else None
    return Path(raw)
