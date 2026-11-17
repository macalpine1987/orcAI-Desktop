"""Private helpers for project_crud (detect name, prune, unique display, initialized)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import (
    _PARAMETER_SUFFIX,
    slugify,
)
from orcai_desktop_sidecar.store import (
    delete_project_row,
    list_project_rows,
)


def _is_initialized(project_dir: Path, orcai_name: str) -> bool:
    param = project_dir / f"{orcai_name}_orcai_parameter.json"
    return param.is_file()


def _detect_cli_orcai_name(project_dir: Path) -> str | None:
    """orcAI project name from an existing ``<name>_orcai_parameter.json`` (CLI init).

    If several parameter files exist, prefer one matching the folder name;
    otherwise raise so the caller can ask the user.
    """
    candidates = sorted(
        p.name[: -len(_PARAMETER_SUFFIX)]
        for p in project_dir.glob(f"*{_PARAMETER_SUFFIX}")
        if p.is_file() and len(p.name) > len(_PARAMETER_SUFFIX)
    )
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    folder = project_dir.name
    for name in candidates:
        if name.casefold() == folder.casefold() or slugify(name) == slugify(folder):
            return name
    raise ValueError(
        "Multiple orcAI parameter files found "
        f"({', '.join(f'{c}{_PARAMETER_SUFFIX}' for c in candidates)}); "
        "open the folder after choosing which project name to keep, or remove extras."
    )


def _prune_missing_project_rows(conn) -> None:
    """Drop registry rows whose folder is gone (USB unplug, moved path, local delete)."""
    for row in list_project_rows(conn):
        # File-in-place-of-dir must also prune (P2-11).
        if not Path(row["path"]).is_dir():
            delete_project_row(conn, row["id"])


def _unique_register_display_name(
    parent: Path,
    display_name: str,
    project_dir: Path,
) -> str:
    """Pick a free display name for register_existing (allow USB copies)."""
    # Lazy import avoids circular dependency with project_crud façade.
    from orcai_desktop_sidecar.project_crud import (
        ProjectNameConflictError,
        check_project_name_available,
    )

    base = display_name.strip() or project_dir.name
    availability = check_project_name_available(
        str(parent),
        base,
        exclude_path=str(project_dir),
        display_name_only=True,
    )
    if availability["available"]:
        return base
    folder = project_dir.name
    candidates = [
        f"{base} ({folder})" if folder.casefold() != base.casefold() else f"{base} (imported)",
        *(f"{base} ({n})" for n in range(2, 100)),
    ]
    for candidate in candidates:
        check = check_project_name_available(
            str(parent),
            candidate,
            exclude_path=str(project_dir),
            display_name_only=True,
        )
        if check["available"]:
            return candidate
    raise ProjectNameConflictError(availability["conflicts"])
