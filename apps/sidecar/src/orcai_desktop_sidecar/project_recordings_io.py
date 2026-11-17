"""Recording file import / delete (extracted from project_registry)."""

from __future__ import annotations

import shutil
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from orcai_desktop_sidecar.project_paths import (
    WAV_SUFFIX,
    annotations_dir,
    read_manifest,
    recordings_dir,
    remove_project_recording_tables,
    write_manifest,
)
from orcai_desktop_sidecar.store import (
    db_session,
    get_project_row,
    upsert_project_row,
)


def list_wav_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    found: list[Path] = []
    for path in directory.rglob("*"):
        if not path.is_file() or path.suffix.lower() != WAV_SUFFIX:
            continue
        if any(part.startswith(".") for part in path.relative_to(directory).parts):
            continue
        found.append(path)
    return sorted(found, key=lambda p: str(p.relative_to(directory)).lower())


def resolve_recording_file(rec_dir: Path, name: str) -> Path | None:
    """Map a UI/table recording id to a WAV on disk.

    The Projects table uses the recording *stem* (CSV column / wav.stem).
    Import/API callers may pass the full filename (``a.wav``). Accept both.
    """
    base = Path(name).name.strip()
    if not base:
        return None
    direct = rec_dir / base
    if direct.is_file():
        return direct
    stem = Path(base).stem if Path(base).suffix else base
    matches = [p for p in list_wav_files(rec_dir) if p.stem == stem]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return sorted(matches, key=lambda p: p.name.lower())[0]
    candidate = rec_dir / f"{stem}{WAV_SUFFIX}"
    return candidate if candidate.is_file() else None


def list_project_recordings(project_id: str) -> list[dict[str, Any]]:
    from orcai_desktop_sidecar.wav_io import read_wav_meta
    from orcai_desktop_sidecar.project_crud import get_project

    project = get_project(project_id)
    if not project:
        raise FileNotFoundError("Project not found")
    rec_dir = Path(project["recordings_dir"])
    items: list[dict[str, Any]] = []
    for wav in list_wav_files(rec_dir):
        stat = wav.stat()
        entry: dict[str, Any] = {
            "name": wav.name,
            "path": str(wav.resolve()),
            "rel_path": wav.name,
            "size_bytes": stat.st_size,
            "modified_at": stat.st_mtime,
            "sample_rate_hz": None,
            "bit_depth": None,
        }
        try:
            meta = read_wav_meta(wav)
            entry["sample_rate_hz"] = meta["sample_rate_hz"]
            entry["bit_depth"] = meta["bit_depth"]
            entry["duration_sec"] = meta["duration_sec"]
        except (OSError, ValueError):
            entry["meta_error"] = True
        items.append(entry)
    return items


def normalize_wav_extensions(directory: Path) -> int:
    """Rename ``.WAV`` / mixed-case suffixes to ``.wav`` so orcAI's glob finds them."""
    if not directory.is_dir():
        return 0
    renamed = 0
    for path in list(directory.rglob("*")):
        if not path.is_file() or path.suffix.lower() != WAV_SUFFIX:
            continue
        if path.suffix == WAV_SUFFIX:
            continue
        dest = path.with_suffix(WAV_SUFFIX)
        if dest.exists():
            continue
        try:
            path.rename(dest)
        except OSError:
            continue
        renamed += 1
    return renamed


def _unique_destination(dest_dir: Path, filename: str) -> Path:
    base = Path(filename).name
    if Path(base).suffix.lower() == WAV_SUFFIX:
        base = f"{Path(base).stem}{WAV_SUFFIX}"
    candidate = dest_dir / base
    if not candidate.exists():
        return candidate
    stem = Path(base).stem
    suffix = Path(base).suffix
    n = 1
    while True:
        candidate = dest_dir / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def import_audio_path(
    project_id: str,
    src: str | Path,
    *,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Import one WAV file (copy) into project recordings."""
    from orcai_desktop_sidecar.wav_io import (
        IMPORT_AUDIO_SUFFIXES,
        audio_import_kind,
        validate_wav_for_project,
    )

    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    src_path = Path(src).expanduser().resolve()
    if not src_path.is_file():
        raise FileNotFoundError(f"Source file not found: {src_path}")
    if src_path.suffix.lower() not in IMPORT_AUDIO_SUFFIXES:
        raise ValueError(
            f"Unsupported audio file: {src_path} (use {', '.join(sorted(IMPORT_AUDIO_SUFFIXES))})"
        )

    kind = audio_import_kind(src_path)
    if kind is None:
        raise ValueError(f"Unsupported audio file: {src_path}")

    project_dir = Path(row["path"]).resolve()
    dest_dir = recordings_dir(project_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    if log:
        log("Copying WAV…")
    meta = validate_wav_for_project(src_path)
    dest = _unique_destination(dest_dir, src_path.name)
    shutil.copy2(src_path, dest)

    _touch_project(project_id)
    return {
        "source": str(src_path),
        "dest": str(dest),
        "name": dest.name,
        "kind": kind,
        "sample_rate_hz": meta["sample_rate_hz"],
        "bit_depth": meta["bit_depth"],
    }


def import_recordings(project_id: str, source_paths: list[str]) -> list[dict[str, str]]:
    # Stable alphabetical import (drag-drop / multi-select often arrive unsorted).
    ordered = sorted(
        source_paths,
        key=lambda p: Path(p).name.casefold(),
    )
    imported: list[dict[str, str]] = []
    copied_dests: list[Path] = []
    try:
        for raw in ordered:
            row = import_audio_path(project_id, raw)
            copied_dests.append(Path(row["dest"]))
            imported.append(
                {
                    "source": row["source"],
                    "dest": row["dest"],
                    "name": row["name"],
                    "sample_rate_hz": row["sample_rate_hz"],
                    "bit_depth": row["bit_depth"],
                }
            )
    except Exception:  # noqa: BLE001 — undo copied WAVs then re-raise
        for dest in copied_dests:
            try:
                dest.unlink(missing_ok=True)
            except OSError:
                pass
        raise
    return imported


def delete_recordings(
    project_id: str,
    *,
    filenames: list[str] | None = None,
    delete_all: bool = False,
) -> dict[str, Any]:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
    if not row:
        raise FileNotFoundError("Project not found")

    rec_dir = recordings_dir(Path(row["path"]).resolve())
    if not rec_dir.is_dir():
        return {"deleted": [], "count": 0}

    skipped: list[str] = []
    if delete_all:
        targets = list_wav_files(rec_dir)
    elif filenames:
        targets = []
        seen: set[str] = set()
        for name in filenames:
            path = resolve_recording_file(rec_dir, name)
            if path is None:
                skipped.append(Path(name).name)
                continue
            key = str(path.resolve())
            if key in seen:
                continue
            seen.add(key)
            targets.append(path)
    else:
        raise ValueError("Provide filenames or delete_all=true")

    deleted: list[str] = []
    for path in targets:
        path.unlink(missing_ok=True)
        deleted.append(path.name)

    project_dir = Path(row["path"]).resolve()
    remaining_wavs = (
        len(list_wav_files(rec_dir)) if rec_dir.is_dir() else 0
    )
    removed_tables: list[str] = []
    if delete_all or remaining_wavs == 0:
        removed_tables = remove_project_recording_tables(project_dir)

    _touch_project(project_id)
    result: dict[str, Any] = {"deleted": deleted, "count": len(deleted)}
    if skipped:
        result["skipped"] = skipped
    if removed_tables:
        result["removed_tables"] = removed_tables
    return result


def _touch_project(project_id: str) -> None:
    with db_session() as conn:
        row = get_project_row(conn, project_id)
        if not row:
            return
        now = time.time()
        upsert_project_row(
            conn,
            id=row["id"],
            path=row["path"],
            display_name=row["display_name"],
            description=row["description"],
            orcai_name=row["orcai_name"],
            created_at=row["created_at"],
            updated_at=now,
        )
    project_dir = Path(row["path"])
    manifest = read_manifest(project_dir)
    if manifest:
        manifest["updated_at"] = now
        write_manifest(project_dir, manifest)

