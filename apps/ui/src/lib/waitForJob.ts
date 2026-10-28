import { cancelJob, fetchJob, type JobRecord } from "../api/jobs";

const DEFAULT_JOB_TIMEOUT_MS = 30 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobWaitTimeoutError extends Error {
  readonly jobId: string;

  constructor(jobId: string, timeoutMs: number) {
    super(`Job ${jobId} did not finish within ${Math.round(timeoutMs / 1000)}s`);
    this.name = "JobWaitTimeoutError";
    this.jobId = jobId;
  }
}

/** Poll until a job reaches a terminal status. */
export async function waitForJobTerminal(
  jobId: string,
  shouldCancel?: () => boolean,
  options?: {
    timeoutMs?: number;
    onUpdate?: (job: JobRecord) => void;
  },
): Promise<JobRecord> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (Date.now() > deadline) {
      try {
        await cancelJob(jobId);
      } catch {
        /* sidecar may already be done */
      }
      throw new JobWaitTimeoutError(jobId, timeoutMs);
    }
    if (shouldCancel?.()) {
      try {
        await cancelJob(jobId);
      } catch {
        /* sidecar may already be done */
      }
      return fetchJob(jobId);
    }
    const job = await fetchJob(jobId);
    options?.onUpdate?.(job);
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return job;
    }
    await sleep(800);
  }
}
