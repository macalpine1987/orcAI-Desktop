/** Bound React / list copies of job logs (matches sidecar JOB_LOG_MAX_LINES). */
export const JOB_LOG_UI_MAX_LINES = 8000;

/** Short tail for jobs list poll payloads (SSE / dock keep the longer ring). */
export const JOB_LIST_POLL_LOG_MAX_LINES = 200;

/** Keep the newest lines only. */
export function trimJobLogLines(
  lines: string[],
  max = JOB_LOG_UI_MAX_LINES,
): string[] {
  if (lines.length <= max) return lines;
  return lines.slice(-max);
}

/** Strip or shorten log bodies from a list/poll snapshot before React state merge. */
export function stripJobLogForListPoll<T extends { log: string[]; log_base?: number | null }>(
  job: T,
  max = JOB_LIST_POLL_LOG_MAX_LINES,
): T {
  const log = job.log ?? [];
  if (log.length === 0) return job;
  if (max <= 0) {
    return { ...job, log: [] };
  }
  const trimmed = trimJobLogLines(log, max);
  if (trimmed === log || trimmed.length === log.length) return job;
  const dropped = log.length - trimmed.length;
  return {
    ...job,
    log: trimmed,
    log_base: (job.log_base ?? 0) + Math.max(0, dropped),
  };
}

/** Absolute cursor after the last retained line (`log_base + length`). */
export function jobLogNextSince(job: {
  log: string[];
  log_base?: number | null;
}): number {
  return Math.max(0, job.log_base ?? 0) + (job.log?.length ?? 0);
}
