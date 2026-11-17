"""Shared helpers for FastAPI route modules."""

from __future__ import annotations


def orcai_available() -> bool:
    """Resolve through main so tests can patch ``main.orcai_available``."""
    from orcai_desktop_sidecar import main as main_mod

    return bool(main_mod.orcai_available())
