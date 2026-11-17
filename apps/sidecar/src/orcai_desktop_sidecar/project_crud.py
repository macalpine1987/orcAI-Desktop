"""Project CRUD registry (extracted from project_registry)."""

from __future__ import annotations

from orcai_desktop_sidecar.project_crud_helpers import (
    _detect_cli_orcai_name,
    _is_initialized,
    _prune_missing_project_rows,
    _unique_register_display_name,
)
from orcai_desktop_sidecar.project_crud_read import (
    ProjectNameConflictError,
    check_project_name_available,
    get_project,
    get_project_by_path,
    list_projects,
    project_to_dict,
)
from orcai_desktop_sidecar.project_crud_ops import (
    create_project,
    delete_project,
    register_existing_project,
    update_project,
)

__all__ = [
    "ProjectNameConflictError",
    "_detect_cli_orcai_name",
    "_is_initialized",
    "_prune_missing_project_rows",
    "_unique_register_display_name",
    "check_project_name_available",
    "create_project",
    "delete_project",
    "get_project",
    "get_project_by_path",
    "list_projects",
    "project_to_dict",
    "register_existing_project",
    "update_project",
]
