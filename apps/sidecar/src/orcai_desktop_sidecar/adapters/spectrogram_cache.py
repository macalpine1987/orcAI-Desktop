"""Disk + RAM cache for full orcAI ``make_spectrogram`` matrices.

Stores the exact preprocessed time×freq [0,1] array so re-open / pan tiles
are slices of the same matrix orcAI would produce — no approximate STFT path.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np

# v2: float32 (bit-exact vs make_spectrogram); invalidates v1 float16 caches.
_CACHE_VERSION = 2
_DEFAULT_CACHE_ROOT = Path.home() / ".orcai-desktop" / "spec-cache" / f"v{_CACHE_VERSION}"
_MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB
# Keep more full matrices in RAM while browsing Results file strip.
_RAM_MAX = 8

_ram_spec: dict[str, tuple[np.ndarray, np.ndarray]] = {}
_ram_order: list[str] = []
_ram_lock = threading.Lock()


def cache_root() -> Path:
    override = os.environ.get("ORCAI_SPEC_CACHE_ROOT")
    if override:
        return Path(override)
    return _DEFAULT_CACHE_ROOT


def _fingerprint_param(orcai_parameter: dict[str, Any]) -> str:
    from orcai_desktop_sidecar.adapters.spectrogram_render import (
        spectrogram_parameter_section,
    )

    spec = spectrogram_parameter_section(orcai_parameter)
    payload = {
        "sampling_rate": spec.get("sampling_rate", 48_000),
        "nfft": spec.get("nfft", spec.get("n_fft", 512)),
        "n_overlap": spec.get("n_overlap", spec.get("hop_length", 256)),
        "freq_range": list(spec.get("freq_range", [0, 16_000])),
        "quantiles": list(spec.get("quantiles", [0.01, 0.999])),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def cache_key(
    wav_path: str | Path,
    *,
    channel: int,
    orcai_parameter: dict[str, Any],
) -> str:
    path = Path(wav_path).resolve()
    st = path.stat()
    material = "|".join(
        [
            str(path),
            str(st.st_mtime_ns),
            str(st.st_size),
            str(int(channel)),
            _fingerprint_param(orcai_parameter),
        ],
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:40]


def _entry_dir(key: str) -> Path:
    return cache_root() / key


def _meta_path(key: str) -> Path:
    return _entry_dir(key) / "meta.json"


def _spec_path(key: str) -> Path:
    return _entry_dir(key) / "spectrogram.f32.npy"


def _times_path(key: str) -> Path:
    return _entry_dir(key) / "times.f64.npy"


def _read_meta(key: str) -> dict[str, Any] | None:
    path = _meta_path(key)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_meta(key: str, meta: dict[str, Any]) -> None:
    d = _entry_dir(key)
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    tmp.replace(_meta_path(key))


def has_full_spectrogram(key: str) -> bool:
    meta = _read_meta(key) or {}
    return (
        bool(meta.get("has_spectrogram"))
        and _spec_path(key).is_file()
        and _times_path(key).is_file()
    )


def load_full_spectrogram(key: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Return (spectrogram float32 time×freq, times) from RAM or disk."""
    with _ram_lock:
        hit = _ram_spec.get(key)
        if hit is not None:
            _ram_touch(key)
            return hit

    if not has_full_spectrogram(key):
        return None
    try:
        # Eager copy — avoid mmap + prune unlink races (SIGBUS / OSError).
        arr = np.asarray(np.load(_spec_path(key)), dtype=np.float32).copy()
        t = np.asarray(np.load(_times_path(key)), dtype=np.float64).copy()
    except OSError:
        return None
    _ram_put(key, arr, t)
    _touch(key)
    return arr, t


def save_full_spectrogram(
    key: str,
    spectrogram: np.ndarray,
    times: np.ndarray,
    *,
    extra: dict[str, Any] | None = None,
) -> None:
    d = _entry_dir(key)
    d.mkdir(parents=True, exist_ok=True)
    spec_f32 = np.asarray(spectrogram, dtype=np.float32)
    times_f64 = np.asarray(times, dtype=np.float64)
    spec_tmp = d / "spectrogram.f32.partial"
    times_tmp = d / "times.f64.partial"
    with open(spec_tmp, "wb") as fh:
        np.save(fh, spec_f32)
    with open(times_tmp, "wb") as fh:
        np.save(fh, times_f64)
    spec_tmp.replace(_spec_path(key))
    times_tmp.replace(_times_path(key))

    meta = _read_meta(key) or {}
    meta.update(
        {
            "version": _CACHE_VERSION,
            "has_spectrogram": True,
            "shape": list(spec_f32.shape),
            "dtype": "float32",
            "source": "make_spectrogram",
            "updated_at": time.time(),
        },
    )
    if extra:
        meta.update(extra)
    _write_meta(key, meta)
    _ram_put(key, spec_f32, times_f64)
    _prune_cache_if_needed()
    _touch(key)


def _ram_touch(key: str) -> None:
    if key in _ram_order:
        _ram_order.remove(key)
    _ram_order.append(key)


def _ram_put(key: str, spec: np.ndarray, times: np.ndarray) -> None:
    with _ram_lock:
        _ram_spec[key] = (spec, times)
        _ram_touch(key)
        while len(_ram_order) > _RAM_MAX:
            old = _ram_order.pop(0)
            _ram_spec.pop(old, None)


def clear_ram_cache() -> None:
    with _ram_lock:
        _ram_spec.clear()
        _ram_order.clear()


def clear_disk_and_ram_cache() -> dict[str, Any]:
    """Delete tile files under ``cache_root()`` and drop the RAM cache.

    Recreates an empty root so the next spectrogram write has a directory.
    """
    import shutil

    root = cache_root()
    files = 0
    bytes_removed = 0
    if root.is_dir():
        for path in root.rglob("*"):
            if path.is_file():
                try:
                    bytes_removed += path.stat().st_size
                    files += 1
                except OSError:
                    pass
        shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True, exist_ok=True)
    clear_ram_cache()
    return {
        "root": str(root),
        "files_removed": files,
        "bytes_removed": bytes_removed,
    }


def _touch(key: str) -> None:
    d = _entry_dir(key)
    if d.is_dir():
        try:
            Path(d, ".touch").write_text(str(time.time()), encoding="utf-8")
        except OSError:
            pass


def _entry_nbytes(key: str) -> int:
    d = _entry_dir(key)
    total = 0
    if not d.is_dir():
        return 0
    for p in d.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def _prune_cache_if_needed() -> None:
    root = cache_root()
    if not root.is_dir():
        return
    entries: list[tuple[float, str, int]] = []
    total = 0
    for child in root.iterdir():
        if not child.is_dir():
            continue
        key = child.name
        nbytes = _entry_nbytes(key)
        total += nbytes
        touch = child / ".touch"
        try:
            mtime = touch.stat().st_mtime if touch.is_file() else child.stat().st_mtime
        except OSError:
            mtime = 0.0
        entries.append((mtime, key, nbytes))
    if total <= _MAX_CACHE_BYTES:
        return
    entries.sort()
    for _mtime, key, nbytes in entries:
        if total <= _MAX_CACHE_BYTES * 0.85:
            break
        d = _entry_dir(key)
        try:
            for p in sorted(d.rglob("*"), reverse=True):
                if p.is_file():
                    p.unlink(missing_ok=True)
            d.rmdir()
        except OSError:
            continue
        total -= nbytes
        with _ram_lock:
            _ram_spec.pop(key, None)
            if key in _ram_order:
                _ram_order.remove(key)
