"""Call orcAI functions without re-stating engine defaults in the sidecar."""

from __future__ import annotations

import inspect
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any


def engine_kwargs(
    fn: Callable[..., Any],
    params: Mapping[str, Any],
    *,
    required: tuple[str, ...] = (),
    rename: Mapping[str, str] | None = None,
    inject: Mapping[str, Any] | None = None,
    skip: frozenset[str] | None = None,
) -> dict[str, Any]:
    """
    Build kwargs for ``fn`` from job ``params``.

    ``rename`` maps *engine* parameter name → *job* param key.
    Only keys present in ``params`` are passed (plus ``inject``), so omitted
    keys keep the engine signature defaults.
    """
    rename = dict(rename or {})
    inject = dict(inject or {})
    skip = skip or frozenset()
    sig = inspect.signature(fn)
    kwargs: dict[str, Any] = {}

    for name in sig.parameters:
        if name in ("self", "cls"):
            continue
        if name in inject:
            kwargs[name] = inject[name]
            continue
        if name in skip:
            continue
        job_key = rename.get(name, name)
        if job_key in params:
            # Key present (including explicit None) → pass through; omit only if absent.
            kwargs[name] = params[job_key]

    for req in required:
        job_key = rename.get(req, req)
        if req not in kwargs:
            raise ValueError(f"{job_key} is required")

    return kwargs


def abs_path(value: Any) -> str | None:
    if value in (None, "", "default"):
        return None
    return str(Path(str(value)).expanduser().resolve())


def snapshot_files(root: Path | None, *, limit: int = 10_000) -> set[str]:
    """Absolute file paths currently under ``root`` (empty if missing)."""
    if root is None:
        return set()
    if not root.is_dir():
        if root.is_file():
            return {str(root.resolve())}
        return set()
    found: set[str] = set()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            found.add(str(path.resolve()))
        except OSError:
            continue
        if len(found) >= limit:
            break
    return found


def collect_created(
    *candidates: Any,
    before: set[str] | None = None,
    root: Path | None = None,
    limit: int = 200,
) -> list[str]:
    """
    Absolute paths of files that exist.

    Prefer explicit file ``candidates``. When ``root`` + ``before`` are given, also
    include files under ``root`` that appeared after the before-snapshot
    (no phantom / unrelated paths). Directory candidates are only listed
    when there is no before-snapshot (avoids treating input roots as created).
    """
    found: list[str] = []
    for c in candidates:
        p = abs_path(c)
        if not p:
            continue
        path = Path(p)
        if path.is_file():
            found.append(str(path.resolve()))
        elif path.is_dir() and before is None:
            # Lone directory without a snapshot — known output root only.
            found.append(str(path.resolve()))
    if root is not None and before is not None:
        after = snapshot_files(root)
        new_files = sorted(after - before)
        for p in new_files[:limit]:
            found.append(p)
    elif root is not None and root.exists() and not found:
        found.append(str(root.resolve()))
    return list(dict.fromkeys(found))


def now() -> float:
    return time.time()


def cli_params_from_engine(kwargs: Mapping[str, Any], **extras: Any) -> dict[str, Any]:
    """Params for ``build_command_line`` from actual engine call kwargs."""
    out = {k: v for k, v in dict(kwargs).items() if k != "msgr"}
    out.update(extras)
    return out
