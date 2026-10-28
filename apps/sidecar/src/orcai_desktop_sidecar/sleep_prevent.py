"""Prevent system idle sleep while long training / TF jobs are running."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
from typing import Any

_log = logging.getLogger(__name__)

# Wizard / pipeline steps that can run for minutes-hours.
KEEP_AWAKE_COMMANDS = frozenset(
    {
        "create-spectrograms",
        "create-label-arrays",
        "create-snippet-table",
        "create-tvt-snippet-tables",
        "create-tvt-data",
        "hpsearch",
        "train",
        "test",
    }
)

_lock = threading.Lock()
_hold_ids: set[str] = set()
_caffeinate_proc: subprocess.Popen[Any] | None = None


def _start_macos() -> bool:
    """``caffeinate -i -w <this pid>``: idle sleep off until we stop it or process exits."""
    global _caffeinate_proc
    if _caffeinate_proc is not None and _caffeinate_proc.poll() is None:
        return True
    try:
        _caffeinate_proc = subprocess.Popen(
            ["caffeinate", "-i", "-w", str(os.getpid())],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return True
    except OSError:
        _log.debug("caffeinate start failed", exc_info=True)
        _caffeinate_proc = None
        return False


def _stop_macos() -> None:
    global _caffeinate_proc
    proc = _caffeinate_proc
    _caffeinate_proc = None
    if proc is None:
        return
    try:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
    except OSError:
        _log.debug("caffeinate stop failed", exc_info=True)


def _start_windows() -> bool:
    """ES_SYSTEM_REQUIRED | ES_CONTINUOUS — cleared by setting CONTINUOUS alone."""
    try:
        import ctypes
    except ImportError:
        return False
    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    try:
        prev = ctypes.windll.kernel32.SetThreadExecutionState(  # type: ignore[attr-defined]
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        )
        return prev != 0
    except Exception:  # noqa: BLE001 — optional platform hook
        _log.debug("SetThreadExecutionState failed", exc_info=True)
        return False


def _stop_windows() -> None:
    try:
        import ctypes
    except ImportError:
        return
    ES_CONTINUOUS = 0x80000000
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 — release must stay best-effort
        _log.debug("SetThreadExecutionState clear failed", exc_info=True)


def _acquire() -> None:
    if sys.platform == "darwin":
        _start_macos()
    elif sys.platform == "win32":
        _start_windows()


def _release() -> None:
    if sys.platform == "darwin":
        _stop_macos()
    elif sys.platform == "win32":
        _stop_windows()


def hold_keep_awake(job_id: str) -> None:
    """Assert idle-sleep prevent for ``job_id`` (idempotent per id)."""
    with _lock:
        was_empty = not _hold_ids
        _hold_ids.add(job_id)
        if was_empty:
            _acquire()
            _log.info("System idle sleep prevented (job %s)", job_id[:8])


def release_keep_awake(job_id: str) -> None:
    """Drop the hold for ``job_id``; release platform assertion when none remain."""
    with _lock:
        if job_id not in _hold_ids:
            return
        _hold_ids.discard(job_id)
        if not _hold_ids:
            _release()
            _log.info("System idle sleep allowed again")


def sync_keep_awake(*, any_keep_awake_running: bool) -> None:
    """Legacy boolean sync — prefer :func:`hold_keep_awake` / :func:`release_keep_awake`."""
    with _lock:
        if any_keep_awake_running and not _hold_ids:
            # Anonymous hold so tests / callers without a job id still work.
            _hold_ids.add("__sync__")
            _acquire()
            _log.info("System idle sleep prevented (training / TF job running)")
        elif not any_keep_awake_running and _hold_ids == {"__sync__"}:
            _hold_ids.clear()
            _release()
            _log.info("System idle sleep allowed again")


def is_keep_awake_active() -> bool:
    with _lock:
        return bool(_hold_ids)


def reset_keep_awake_for_tests() -> None:
    """Drop assertion and clear state (unit tests only)."""
    with _lock:
        if _hold_ids:
            _release()
        _hold_ids.clear()
