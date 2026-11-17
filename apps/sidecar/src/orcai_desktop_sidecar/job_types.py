"""Job domain types shared by queue, routes, and persistence."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


_TERMINAL_STATUSES = frozenset(
    {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}
)


@dataclass
class Job:
    id: str
    command: str
    params: dict[str, Any]
    status: JobStatus = JobStatus.PENDING
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    # Wall clock when worker entered RUNNING (excludes plan/queue wait).
    started_at: float | None = None
    log: list[str] = field(default_factory=list)
    # Absolute index of log[0] after ring-buffer trim (SSE /log since cursor).
    log_base: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    command_line: str | None = None
    exit_code: int | None = None
    progress: float | None = None
    priority: int = 0
    artifacts: list[str] = field(default_factory=list)
    retry_of: str | None = None

