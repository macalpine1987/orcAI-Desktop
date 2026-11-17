"""tqdm bridge for CSV predict progress (JobMessenger + job progress)."""

from __future__ import annotations

import contextlib
import os
import re
from typing import Any

# Structured line for Desktop console / resume sync (orcAI CSV uses silent per-file msgr).
PREDICT_FILE_LOG_RE = re.compile(
    r"^\[predict-file\]\s+(\d+)/(\d+)\s+(\S+)",
)
_STEM_FROM_TQDM_RE = re.compile(r"^([^:\-]+?)(?:\s*[-:].*)?$")


def _stem_from_tqdm_desc(desc: str | None) -> str | None:
    if not desc:
        return None
    text = str(desc).strip()
    if not text or text == "Starting ...":
        return None
    match = _STEM_FROM_TQDM_RE.match(text)
    if not match:
        return None
    stem = match.group(1).strip()
    return stem or None


class _PredictFileTqdm:
    """Bridge orcAI's CSV tqdm into JobMessenger + job progress (per file)."""

    def __new__(cls, *args: Any, **kwargs: Any):
        from tqdm import tqdm

        class _Impl(tqdm):  # type: ignore[misc, valid-type]
            def __init__(
                self,
                *a: Any,
                job_id: str,
                msgr: Any,
                **kw: Any,
            ) -> None:
                self._job_id = job_id
                self._msgr = msgr
                self._last_stem: str | None = None
                kw.setdefault("disable", False)
                kw["file"] = open(os.devnull, "w")  # noqa: SIM115 — closed in close()
                super().__init__(*a, **kw)

            def set_description(self, desc: str | None = None, refresh: bool = True) -> None:
                stem = _stem_from_tqdm_desc(desc)
                if stem and stem != self._last_stem:
                    self._last_stem = stem
                    total = int(self.total or 0) or 1
                    current = min(int(self.n) + 1, total)
                    self._msgr.print(
                        f"[predict-file] {current}/{total} {stem}",
                        severity=1,
                    )
                    from orcai_desktop_sidecar.jobs import set_progress

                    # Half-credit for the file in flight so UI is not stuck at 0%
                    # during the (often long) first recording.
                    set_progress(self._job_id, min(0.99, (current - 0.5) / total))
                return super().set_description(desc, refresh=refresh)

            def update(self, n: float | None = 1) -> bool | None:
                result = super().update(n)
                total = int(self.total or 0)
                if total > 0:
                    from orcai_desktop_sidecar.jobs import set_progress

                    set_progress(self._job_id, min(1.0, float(self.n) / total))
                return result

            def close(self) -> None:
                sink = getattr(self, "fp", None)
                try:
                    super().close()
                finally:
                    if sink is not None:
                        with contextlib.suppress(Exception):
                            sink.close()

        return _Impl(*args, **kwargs)


def _with_predict_file_tqdm(job_id: str, msgr: Any):
    """Patch ``orcai.predict.tqdm`` for the duration of a CSV batch call."""
    import orcai.predict as predict_mod

    original = predict_mod.tqdm

    def factory(*args: Any, **kwargs: Any) -> Any:
        return _PredictFileTqdm(*args, job_id=job_id, msgr=msgr, **kwargs)

    predict_mod.tqdm = factory  # type: ignore[assignment]
    return original


def _restore_predict_tqdm(original: Any) -> None:
    import orcai.predict as predict_mod

    predict_mod.tqdm = original
