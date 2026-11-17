"""Detect whether bundled librosa/orcAI spectrogram imports work.

numba≥0.61 + librosa guvectorize can fail on some hosts with
``AttributeError: 'function' object has no attribute 'get_call_template'``,
which surfaces as ``ImportError: cannot import name 'amplitude_to_db'``.
"""

from __future__ import annotations

_LIBROSA_OK: bool | None = None
_LIBROSA_REASON = ""


def librosa_core_usable() -> tuple[bool, str]:
    """Return (ok, reason) for ``from librosa import load, amplitude_to_db``."""
    global _LIBROSA_OK, _LIBROSA_REASON
    if _LIBROSA_OK is not None:
        return _LIBROSA_OK, _LIBROSA_REASON
    try:
        from librosa import amplitude_to_db, load  # noqa: F401

        _LIBROSA_OK = True
        _LIBROSA_REASON = ""
    except Exception as exc:  # noqa: BLE001 — probe only
        _LIBROSA_OK = False
        _LIBROSA_REASON = f"{type(exc).__name__}: {exc}"
    return _LIBROSA_OK, _LIBROSA_REASON


def require_librosa(test: object) -> None:
    """``unittest`` skip when librosa core symbols cannot load."""
    ok, reason = librosa_core_usable()
    if not ok:
        test.skipTest(f"bundled librosa unusable ({reason})")
