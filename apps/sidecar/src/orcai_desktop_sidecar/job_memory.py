"""Limit TensorFlow / worker RAM so a cancelled train cannot thrash the whole Mac."""

from __future__ import annotations

import logging
import os
import sys

_log = logging.getLogger(__name__)

# Commands that load TF datasets / models into unified memory (Apple Silicon).
HEAVY_TF_COMMANDS = frozenset(
    {
        "create-spectrograms",
        "create-label-arrays",
        "create-tvt-data",
        "hpsearch",
        "train",
        "test",
    }
)


def physical_ram_bytes() -> int | None:
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page = os.sysconf("SC_PAGE_SIZE")
        if isinstance(pages, int) and isinstance(page, int) and pages > 0 and page > 0:
            return pages * page
    except (ValueError, OSError, AttributeError):
        pass
    return None


def apply_worker_memory_guard(command: str | None = None) -> None:
    """Call at the start of a job worker process (before importing TensorFlow).

    Caps address space (~fraction of RAM) so the *worker* OOMs instead of the host.
    Also sets ``TF_FORCE_GPU_ALLOW_GROWTH`` for Metal/CUDA growth after TF import.
    """
    os.environ.setdefault("TF_FORCE_GPU_ALLOW_GROWTH", "true")
    _apply_address_space_limit(command)


def _apply_address_space_limit(command: str | None) -> None:
    if sys.platform == "win32":
        return
    try:
        import resource
    except ImportError:
        return

    env = os.environ.get("ORCAI_JOB_RSS_LIMIT_MB", "").strip()
    soft: int | None = None
    if env:
        try:
            soft = max(512, int(env)) * 1024 * 1024
        except ValueError:
            soft = None
    if soft is None:
        total = physical_ram_bytes()
        if total is None:
            return
        # Leave headroom for Desktop UI + sidecar + OS. Heavy TF jobs otherwise
        # fill unified memory and freeze the machine on cancel.
        frac = 0.70 if command in HEAVY_TF_COMMANDS else 0.85
        soft = int(total * frac)

    try:
        soft_cur, hard_cur = resource.getrlimit(resource.RLIMIT_AS)
        if hard_cur > 0:
            soft = min(soft, hard_cur)
            hard = hard_cur
        else:
            hard = soft
        # Do not raise an already-lower ceiling.
        if 0 < soft_cur <= soft and (hard_cur == soft_cur or hard_cur < 0):
            return
        resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
        _log.info(
            "Worker address-space limit set to ~%.1f GiB (command=%s)",
            soft / (1024**3),
            command or "?",
        )
    except (ValueError, OSError) as exc:
        _log.debug("RLIMIT_AS not applied: %s", exc)
