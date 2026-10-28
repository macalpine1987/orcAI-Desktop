import type { JobRecord } from "../api/jobs";

export type JobFilter = "all" | "active" | "errors" | "history";

/** Duration in seconds of actual work (or queue wait while pending). */
export function jobDurationSec(
  job: JobRecord,
  nowSec = Date.now() / 1000,
): number {
  const start =
    job.status === "pending"
      ? job.created_at
      : typeof job.started_at === "number"
        ? job.started_at
        : job.created_at;
  const end =
    job.status === "running" || job.status === "pending"
      ? nowSec
      : job.updated_at;
  return Math.max(0, end - start);
}

export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatJobTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function jobProgressPercent(job: JobRecord): number | null {
  if (job.status === "completed") return 100;
  if (job.status === "failed" || job.status === "cancelled") {
    if (typeof job.progress === "number" && job.progress > 0) {
      return Math.round(job.progress * 100);
    }
    return null;
  }
  if (typeof job.progress === "number") {
    // 0 / unset → indeterminate strip (no "0%" until real progress arrives).
    if (job.status === "running" && job.progress <= 0) return null;
    return Math.round(Math.min(1, Math.max(0, job.progress)) * 100);
  }
  if (job.status === "pending") return null;
  return null;
}

/** Running job without numeric progress from sidecar (e.g. predict on one WAV). */
export function isJobProgressIndeterminate(job: JobRecord): boolean {
  if (job.status !== "running") return false;
  if (typeof job.progress !== "number") return true;
  return job.progress <= 0;
}

export function jobStatusI18nKey(
  status: JobRecord["status"],
): `jobs.status.${JobRecord["status"]}` {
  return `jobs.status.${status}`;
}

export function filterJobs(jobs: JobRecord[], filter: JobFilter): JobRecord[] {
  switch (filter) {
    case "active":
      return jobs.filter(
        (j) => j.status === "pending" || j.status === "running",
      );
    case "errors":
      return jobs.filter((j) => j.status === "failed");
    case "history":
      return jobs.filter(
        (j) =>
          j.status === "completed" ||
          j.status === "failed" ||
          j.status === "cancelled",
      );
    default:
      return jobs;
  }
}

export function sortJobsNewestFirst(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort((a, b) => b.created_at - a.created_at);
}

/** Stable fingerprint so poll does not remount the table when nothing changed. */
export function jobsListDisplayKey(jobs: JobRecord[]): string {
  return jobs
    .map((j) => {
      const progress =
        typeof j.progress === "number" ? Math.round(j.progress * 1000) : "";
      return [
        j.id,
        j.status,
        progress,
        j.created_at,
        Math.floor(j.updated_at),
        j.error ?? "",
        j.log.length,
        j.command,
        j.command_line ?? "",
        j.exit_code ?? "",
      ].join("\u001f");
    })
    .join("\n");
}

export function jobsListsDisplayEqual(a: JobRecord[], b: JobRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return jobsListDisplayKey(a) === jobsListDisplayKey(b);
}

export function pickActiveJob(jobs: JobRecord[]): JobRecord | null {
  const running = jobs.find((j) => j.status === "running");
  if (running) return running;
  // FIFO: next to run is the oldest pending (list may be newest-first).
  let oldest: JobRecord | null = null;
  for (const j of jobs) {
    if (j.status !== "pending") continue;
    if (!oldest || j.created_at < oldest.created_at) oldest = j;
  }
  return oldest;
}

const JOB_STATUS_RANK: Record<JobRecord["status"], number> = {
  pending: 0,
  running: 1,
  completed: 2,
  failed: 2,
  cancelled: 2,
};

/**
 * Merge two snapshots of the same job without regressing status/log.
 * Fixes import-audio: stale pending upsert must not wipe a fresher fetch/SSE log.
 */
export function mergeJobRecords(prev: JobRecord, incoming: JobRecord): JobRecord {
  if (prev.id !== incoming.id) return incoming;

  const prevRank = JOB_STATUS_RANK[prev.status] ?? 0;
  const incRank = JOB_STATUS_RANK[incoming.status] ?? 0;
  const status = incRank >= prevRank ? incoming.status : prev.status;

  const prevLog = prev.log ?? [];
  const incLog = incoming.log ?? [];
  const log = incLog.length >= prevLog.length ? incLog : prevLog;

  let progress = incoming.progress;
  if (typeof prev.progress === "number") {
    if (typeof progress === "number") {
      progress = Math.max(prev.progress, progress);
    } else if (incRank < prevRank) {
      progress = prev.progress;
    }
  }

  return {
    ...prev,
    ...incoming,
    status,
    log,
    progress: progress ?? prev.progress ?? null,
    error: incoming.error ?? prev.error,
    result: incoming.result ?? prev.result,
    exit_code: incoming.exit_code ?? prev.exit_code,
    command_line: incoming.command_line ?? prev.command_line,
    started_at: incoming.started_at ?? prev.started_at ?? null,
    updated_at: Math.max(prev.updated_at, incoming.updated_at),
  };
}
