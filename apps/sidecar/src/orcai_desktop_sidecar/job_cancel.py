"""Cooperative cancellation and hard termination for sidecar jobs."""

from __future__ import annotations

import contextlib
import os
import signal
import threading
import time
from multiprocessing.process import BaseProcess

from orcai_desktop_sidecar.job_memory import HEAVY_TF_COMMANDS

_lock = threading.Lock()
_cancel_events: dict[str, threading.Event] = {}
_workers: dict[str, BaseProcess] = {}
_threads: dict[str, threading.Thread] = {}


class JobCancelled(Exception):
    """Raised when a job was cancelled before or during execution."""


def register(job_id: str) -> threading.Event:
    event = threading.Event()
    with _lock:
        _cancel_events[job_id] = event
    return event


def register_worker(job_id: str, process: BaseProcess) -> None:
    with _lock:
        old = _workers.pop(job_id, None)
        if old is not None and old.is_alive():
            _terminate_process(old, immediate=True)
        _workers[job_id] = process


def register_thread(job_id: str, thread: threading.Thread) -> None:
    """Track in-process job threads so cancel can wait before cleanup."""
    with _lock:
        _threads[job_id] = thread


def clear(job_id: str) -> None:
    with _lock:
        _cancel_events.pop(job_id, None)
        _workers.pop(job_id, None)
        _threads.pop(job_id, None)


def clear_worker(job_id: str) -> None:
    with _lock:
        _workers.pop(job_id, None)
        _threads.pop(job_id, None)


def request_cancel(job_id: str) -> bool:
    with _lock:
        event = _cancel_events.get(job_id)
        if event:
            event.set()
            return True
    return False


def is_cancelled(job_id: str) -> bool:
    with _lock:
        event = _cancel_events.get(job_id)
        return bool(event and event.is_set())


def check(job_id: str) -> None:
    if is_cancelled(job_id):
        raise JobCancelled("Job cancelled by user")
    from orcai_desktop_sidecar.jobs import JobStatus, get_job

    job = get_job(job_id)
    if job and job.status == JobStatus.CANCELLED:
        raise JobCancelled("Job cancelled by user")


def terminate_worker(job_id: str, *, immediate: bool | None = None) -> bool:
    """Stop the job subprocess.

    ``immediate=True`` (default for heavy TF commands): SIGKILL the process group
    without waiting on SIGTERM. Graceful TF shutdown on cancel often allocates
    more unified memory and freezes the host.
    """
    with _lock:
        proc = _workers.pop(job_id, None)
    if proc is None or not proc.is_alive():
        return False
    if immediate is None:
        immediate = _command_wants_immediate_kill(job_id)
    _terminate_process(proc, immediate=immediate)
    return True


def wait_worker_stopped(job_id: str, *, timeout: float = 0.75) -> bool:
    """
    Block until the registered subprocess/thread for ``job_id`` has stopped.

    Used by cancel so artifact cleanup runs after writers have stopped.
    """
    deadline = time.monotonic() + max(0.0, timeout)
    with _lock:
        proc = _workers.get(job_id)
        thread = _threads.get(job_id)

    if proc is not None:
        remaining = max(0.0, deadline - time.monotonic())
        if proc.is_alive():
            proc.join(timeout=remaining)
        return not proc.is_alive()

    if thread is not None:
        remaining = max(0.0, deadline - time.monotonic())
        if thread.is_alive():
            thread.join(timeout=remaining)
        return not thread.is_alive()

    # No registered worker (e.g. still pending): brief settle for FS consistency.
    time.sleep(min(0.05, max(0.0, deadline - time.monotonic())))
    return True


def _command_wants_immediate_kill(job_id: str) -> bool:
    try:
        from orcai_desktop_sidecar.jobs import get_job

        job = get_job(job_id)
        if job and job.command in HEAVY_TF_COMMANDS:
            return True
    except Exception:  # noqa: BLE001 — cancel path must stay resilient
        return True
    return False


def _terminate_process(proc: BaseProcess, *, immediate: bool = False) -> None:
    pid = getattr(proc, "pid", None)
    if immediate:
        _kill_process_tree(pid)
        proc.join(timeout=2)
        if proc.is_alive():
            with contextlib.suppress(Exception):
                proc.kill()
            proc.join(timeout=2)
        return

    with contextlib.suppress(Exception):
        proc.terminate()
    proc.join(timeout=1.5)
    if proc.is_alive():
        _kill_process_tree(pid)
        proc.join(timeout=2)
        if proc.is_alive():
            with contextlib.suppress(Exception):
                proc.kill()
            proc.join(timeout=2)


def _kill_process_tree(pid: int | None) -> None:
    if pid is None or pid <= 0:
        return
    if hasattr(os, "killpg"):
        try:
            os.killpg(pid, signal.SIGKILL)
            return
        except (OSError, ProcessLookupError):
            pass
    try:
        os.kill(pid, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        pass
