"""Route tqdm progress bars into job.progress, thread-local safe."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

from orcai_desktop_sidecar.jobs import set_progress

_log = logging.getLogger(__name__)

_local = threading.local()
_patch_lock = threading.Lock()
_patch_depth = 0
# (owner, attr, original) — owner is a class or module
_originals: list[tuple[Any, str, Any]] = []


def _active_job_id() -> str | None:
    return getattr(_local, "job_id", None)


def _report_bar_progress(bar: Any) -> None:
    job_id = _active_job_id()
    if not job_id:
        return
    total = getattr(bar, "total", None)
    n_done = getattr(bar, "n", None)
    if total and n_done is not None and float(total) > 0:
        set_progress(job_id, max(0.0, min(1.0, float(n_done) / float(total))))


def _patch_std_tqdm_methods() -> None:
    """Patch ``tqdm.std.tqdm`` methods in place.

    orcAI prep steps bind ``from tqdm import tqdm`` at import time. Replacing
    ``tqdm.tqdm`` on the module does not update those bindings; patching methods
    on the shared class does.
    """
    try:
        import tqdm.std as tqdm_std
    except ImportError:
        return

    cls = tqdm_std.tqdm
    if any(owner is cls and attr == "update" for owner, attr, _ in _originals):
        return

    original_update = cls.update
    original_reset = cls.reset

    def patched_update(self: Any, n: float | int = 1) -> Any:
        result = original_update(self, n)
        _report_bar_progress(self)
        return result

    def patched_reset(self: Any, total: Any = None) -> Any:
        # Keras TqdmCallback resets epoch total in on_train_begin.
        result = original_reset(self, total=total)
        _report_bar_progress(self)
        return result

    _originals.append((cls, "update", original_update))
    _originals.append((cls, "reset", original_reset))
    cls.update = patched_update  # type: ignore[method-assign]
    cls.reset = patched_reset  # type: ignore[method-assign]


def _patch_tqdm_callback_init() -> None:
    """Force Keras TqdmCallback to use ``tqdm.std.tqdm`` (epoch bars for train).

    ``TqdmCallback.__init__`` binds ``tqdm_class=tqdm.auto.tqdm`` at *definition*
    time; auto inherits ``update`` from std, so the in-place method patch still
    applies — but we force std explicitly for predictability.
    """
    try:
        import tqdm.std as tqdm_std
        from tqdm.keras import TqdmCallback
    except ImportError:
        return

    if any(mod is TqdmCallback and attr == "__init__" for mod, attr, _ in _originals):
        return

    original_init = TqdmCallback.__init__

    def patched_init(
        self: Any,
        epochs: Any = None,
        data_size: Any = None,
        batch_size: Any = None,
        verbose: int = 1,
        tqdm_class: Any = None,
        **tqdm_kwargs: Any,
    ) -> None:
        tqdm_class = tqdm_std.tqdm
        original_init(
            self,
            epochs=epochs,
            data_size=data_size,
            batch_size=batch_size,
            verbose=verbose,
            tqdm_class=tqdm_class,
            **tqdm_kwargs,
        )

    _originals.append((TqdmCallback, "__init__", original_init))
    TqdmCallback.__init__ = patched_init  # type: ignore[method-assign]


def _ensure_patched() -> None:
    global _patch_depth
    with _patch_lock:
        _patch_depth += 1
        if any(attr == "update" for _, attr, _ in _originals):
            return
        try:
            _patch_std_tqdm_methods()
        except Exception:  # noqa: BLE001 — tqdm patch must not break jobs
            _log.debug("tqdm.std method patch skipped", exc_info=True)
        try:
            _patch_tqdm_callback_init()
        except Exception:  # noqa: BLE001 — keras tqdm hook is optional
            _log.debug("tqdm.keras __init__ patch skipped", exc_info=True)


def _maybe_unpatch() -> None:
    global _patch_depth
    with _patch_lock:
        _patch_depth = max(0, _patch_depth - 1)
        if _patch_depth > 0:
            return
        while _originals:
            owner, attr, original = _originals.pop()
            try:
                setattr(owner, attr, original)
            except (AttributeError, TypeError):
                _log.debug("tqdm unpatch setattr failed for %s.%s", owner, attr, exc_info=True)


def install_job_tqdm(job_id: str) -> Callable[[], None]:
    """
    Bind this thread's job_id and ensure tqdm reports progress.

    Safe under max_concurrent=1; thread-local job_id avoids cross-talk if
    concurrency is raised later.
    """
    prev = _active_job_id()
    _local.job_id = job_id
    _ensure_patched()

    def restore() -> None:
        _local.job_id = prev
        _maybe_unpatch()

    return restore
