"""Resolve and validate user-supplied filesystem paths for the sidecar API."""

from __future__ import annotations

import os
import re
from pathlib import Path

# Unix system roots (matched after normalizing separators to "/").
_BLOCKED_UNIX_PREFIXES = (
    "/etc",
    "/private/etc",
    "/var/root",
    "/System",
    "/usr",
    "/bin",
    "/sbin",
)

# Windows extended / device namespace prefixes.
_BLOCKED_WIN_NT_PREFIXES = (
    "\\\\?\\",
    "\\\\.\\",
    "//?/",
    "//./",
)

# Drive-letter Windows system roots when SystemRoot env is unset.
_WIN_SYSTEM_ROOT_RE = re.compile(r"^[a-z]:/(windows|winnt)(/|$)", re.IGNORECASE)


def _normalize_path_key(path: str) -> str:
    return path.replace("\\", "/").lower()


def _assert_not_blocked(resolved: Path) -> None:
    text = str(resolved)
    lower = text.lower()
    normalized = _normalize_path_key(text)

    for prefix in _BLOCKED_UNIX_PREFIXES:
        p = prefix.lower()
        if normalized == p or normalized.startswith(p + "/"):
            raise PermissionError(f"Access denied: {resolved}")

    for prefix in _BLOCKED_WIN_NT_PREFIXES:
        if lower.startswith(prefix.lower()):
            raise PermissionError(f"Access denied: {resolved}")

    # %SystemRoot% / SYSTEMROOT (expanded paths on Windows).
    for key in ("SystemRoot", "SYSTEMROOT", "windir", "WINDIR"):
        root = os.environ.get(key)
        if not root:
            continue
        root_norm = _normalize_path_key(str(Path(root)))
        if normalized == root_norm or normalized.startswith(root_norm + "/"):
            raise PermissionError(f"Access denied: {resolved}")

    if _WIN_SYSTEM_ROOT_RE.match(normalized):
        raise PermissionError(f"Access denied: {resolved}")


def resolve_user_path(path: str, *, expect_wav: bool = False) -> Path:
    """Return a resolved absolute path to an existing file."""
    if not path or not str(path).strip():
        raise ValueError("path is required")

    raw = Path(path).expanduser()
    if not raw.is_absolute():
        raise ValueError("path must be absolute")

    try:
        resolved = raw.resolve(strict=True)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"File not found: {raw}") from exc
    except OSError as exc:
        raise ValueError(f"Invalid path: {raw}") from exc

    if not resolved.is_file():
        raise FileNotFoundError(f"Not a file: {resolved}")

    _assert_not_blocked(resolved)

    if expect_wav and resolved.suffix.lower() != ".wav":
        raise ValueError(f"Expected a .wav file: {resolved}")

    return resolved


def resolve_user_csv_path(path: str) -> Path:
    resolved = resolve_user_path(path)
    if resolved.suffix.lower() != ".csv":
        raise ValueError(f"Expected a .csv file: {resolved}")
    return resolved


def resolve_user_label_path(path: str) -> Path:
    resolved = resolve_user_path(path)
    if resolved.suffix.lower() not in {".txt", ".csv"}:
        raise ValueError(f"Expected a label file (.txt or .csv): {resolved}")
    return resolved


def resolve_user_json_path(path: str) -> Path:
    """Existing JSON parameter file (orcai_parameter.json, etc.)."""
    resolved = resolve_user_path(path)
    if resolved.suffix.lower() != ".json":
        raise ValueError(f"Expected a .json file: {resolved}")
    return resolved


def resolve_user_dir(path: str) -> Path:
    """Existing absolute directory (project / scan roots)."""
    if not path or not str(path).strip():
        raise ValueError("path is required")
    raw = Path(path).expanduser()
    if not raw.is_absolute():
        raise ValueError("path must be absolute")
    try:
        resolved = raw.resolve(strict=True)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Directory not found: {raw}") from exc
    except OSError as exc:
        raise ValueError(f"Invalid path: {raw}") from exc
    if not resolved.is_dir():
        raise FileNotFoundError(f"Not a directory: {resolved}")
    _assert_not_blocked(resolved)
    return resolved


def resolve_user_output_path(path: str) -> Path:
    """Absolute writable file path (file need not exist yet)."""
    if not path or not str(path).strip():
        raise ValueError("path is required")
    raw = Path(path).expanduser()
    if not raw.is_absolute():
        raise ValueError("path must be absolute")
    resolved = raw.resolve(strict=False)
    _assert_not_blocked(resolved)
    if resolved.parent.exists() and not resolved.parent.is_dir():
        raise ValueError(f"Parent is not a directory: {resolved.parent}")
    if resolved.parent.exists():
        _assert_not_blocked(resolved.parent.resolve())
    return resolved


def resolve_user_existing_or_probe(path: str) -> Path:
    """Absolute path for existence probes — blocked prefixes denied even if missing."""
    if not path or not str(path).strip():
        raise ValueError("path is required")
    raw = Path(path).expanduser()
    if not raw.is_absolute():
        raise ValueError("path must be absolute")
    resolved = raw.resolve(strict=False)
    _assert_not_blocked(resolved)
    return resolved
