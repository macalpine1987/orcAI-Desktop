"""Messenger that streams orcAI log lines into a job record."""

from __future__ import annotations

import os
import re
from typing import Any

from orcai.auxiliary import Messenger

from orcai_desktop_sidecar.jobs import append_log, set_progress

_PCT_RE = re.compile(
    r"(?:^|[^\d])(\d{1,3}(?:\.\d+)?)\s*%|epoch\s+(\d+)\s*/\s*(\d+)",
    re.IGNORECASE,
)

# orcAI ``hpsearch`` hardcodes "Sequential - running on 1 GPU" when parallel=False,
# even when TensorFlow has no visible GPU (Desktop CPU mode). Rewrite for honesty.
_HPSEARCH_SEQUENTIAL_GPU = re.compile(
    r"^Sequential\s*-\s*running on 1 GPU\s*$",
    re.IGNORECASE,
)
_HPSEARCH_PARALLEL_GPU = re.compile(
    r"^Parallel\s*-\s*running on (\d+) GPU\s*$",
    re.IGNORECASE,
)


def rewrite_device_log_line(text: str, compute_device: str | None = None) -> str:
    """Correct misleading orcAI device banners for the active compute mode."""
    device = (compute_device or os.environ.get("ORCAI_COMPUTE_DEVICE") or "cpu").strip().lower()
    stripped = text.strip()
    if device == "cpu":
        if _HPSEARCH_SEQUENTIAL_GPU.match(stripped):
            return "Sequential - running on CPU"
        m = _HPSEARCH_PARALLEL_GPU.match(stripped)
        if m:
            return "Parallel - running on CPU (no GPU visible)"
    return text


class JobMessenger(Messenger):
    """Forward orcAI messages to the job log (plain text, no ANSI)."""

    def __init__(self, job_id: str, verbosity: int = 2, title: str | None = None):
        # Parent __init__ may call print() via start(title) — _job_id must exist first.
        self._job_id = job_id
        super().__init__(verbosity=verbosity, title=title)

    def print(
        self,
        message: Any,
        indent: int = 0,
        set_indent: int | None = None,
        prepend: str = "",
        severity: int = 2,
        **kwargs: Any,
    ) -> None:
        # Do not call super().print() — orcAI progress belongs only in the job log.
        if self.verbosity < severity:
            return
        text = self._message_to_line(message, prepend)
        text = rewrite_device_log_line(text)
        if text.strip():
            append_log(self._job_id, text)
            progress = self._parse_progress(text)
            if progress is not None:
                set_progress(self._job_id, progress)

    @staticmethod
    def _parse_progress(text: str) -> float | None:
        match = _PCT_RE.search(text)
        if not match:
            return None
        if match.group(1) is not None:
            value = float(match.group(1)) / 100.0
            if 0.0 <= value <= 1.0:
                return value
            return None
        current, total = int(match.group(2)), int(match.group(3))
        if total <= 0:
            return None
        return max(0.0, min(1.0, current / total))

    @staticmethod
    def _message_to_line(message: Any, prepend: str) -> str:
        if isinstance(message, str):
            return prepend + message
        if isinstance(message, dict):
            return prepend + str(message)
        if isinstance(message, list):
            return prepend + "; ".join(str(x) for x in message[:5])
        return prepend + str(message)
