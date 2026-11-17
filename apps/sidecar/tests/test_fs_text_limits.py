"""fs_read_text / write-text size caps (audit MEM-01)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from orcai_desktop_sidecar.routes import fs as fs_routes


def test_fs_read_text_rejects_oversized_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    big = tmp_path / "huge.txt"
    big.write_bytes(b"x" * (fs_routes._FS_TEXT_MAX_BYTES + 1))

    def fake_resolve(path: str):
        return Path(path)

    monkeypatch.setattr(
        "orcai_desktop_sidecar.paths.resolve_user_path",
        fake_resolve,
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(fs_routes.fs_read_text(str(big)))
    assert exc.value.status_code == 413


def test_fs_read_text_allows_small_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    small = tmp_path / "ok.txt"
    small.write_text("hello", encoding="utf-8")

    monkeypatch.setattr(
        "orcai_desktop_sidecar.paths.resolve_user_path",
        lambda path: Path(path),
    )
    out = asyncio.run(fs_routes.fs_read_text(str(small)))
    assert out["content"] == "hello"
