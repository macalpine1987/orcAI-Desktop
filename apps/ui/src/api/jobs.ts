import { getSidecarBase } from "./sidecar";
import { withJobVerbosity } from "../lib/integrationSettings";
import { truncateUserError } from "../lib/userFacingError";
import {
  SIDECAR_HTTP_MEDIUM_LONG_MS,
  SIDECAR_HTTP_SHORT_MS,
} from "../lib/timeouts";

/** Short HTTP failures for toasts (status + truncated body, not full FastAPI dump). */
async function throwJobsHttpError(
  label: string,
  res: Response,
): Promise<never> {
  const detail = (await res.text()).trim();
  const short = detail ? truncateUserError(detail, 120) : "";
  throw new Error(
    short ? `${label}: ${res.status} ${short}` : `${label}: ${res.status}`,
  );
}

export type JobRecord = {
  id: string;
  command: string;
  params: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: number;
  updated_at: number;
  /** When the worker entered running (excludes queue wait). */
  started_at?: number | null;
  log: string[];
  /** Absolute index of log[0] after sidecar ring-buffer trim. */
  log_base?: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  command_line?: string | null;
  exit_code?: number | null;
  progress?: number | null;
  priority?: number;
  artifacts?: string[];
  retry_of?: string | null;
};

export async function fetchJobs(projectDir?: string): Promise<JobRecord[]> {
  const url = new URL(`${getSidecarBase()}/v1/jobs`);
  if (projectDir) url.searchParams.set("project_dir", projectDir);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) throw new Error(`Jobs list failed: ${res.status}`);
  const data = (await res.json()) as { jobs: JobRecord[] };
  return data.jobs;
}

export async function createJob(
  command: string,
  params: Record<string, unknown> = {},
): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, params: withJobVerbosity(params) }),
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) await throwJobsHttpError("Create job failed", res);
  return (await res.json()) as JobRecord;
}

export type PredictJobParams = {
  recording_path: string;
  channel?: number;
  threshold?: number;
  model?: string;
  model_dir?: string;
  output_path?: string;
  overwrite?: boolean;
  save_probabilities?: boolean;
  base_dir_recording?: string;
  call_duration_limits?: string;
  label_suffix?: string;
  verbosity?: number;
  project_dir?: string;
  /** Subset of recording_table.csv stems for native orcAI CSV batch. */
  recording_names?: string[];
};

export async function createPredictJob(
  params: PredictJobParams,
): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withJobVerbosity({ ...params })),
    signal: AbortSignal.timeout(SIDECAR_HTTP_MEDIUM_LONG_MS),
  });
  if (!res.ok) await throwJobsHttpError("Predict job failed", res);
  return (await res.json()) as JobRecord;
}

export async function cancelJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/${jobId}/cancel`, {
    method: "POST",
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) await throwJobsHttpError("Cancel job failed", res);
  return (await res.json()) as JobRecord;
}

export async function retryJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/${jobId}/retry`, {
    method: "POST",
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) await throwJobsHttpError("Retry job failed", res);
  return (await res.json()) as JobRecord;
}

export async function fetchJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/${jobId}`, {
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) throw new Error(`Job fetch failed: ${res.status}`);
  return (await res.json()) as JobRecord;
}

export type JobLogSlice = {
  id: string;
  since: number;
  next_since: number;
  lines: string[];
  progress: number | null;
  status: JobRecord["status"];
  exit_code: number | null;
};

/** Incremental log poll (console). */
export async function fetchJobLogSince(
  jobId: string,
  since = 0,
): Promise<JobLogSlice> {
  const url = new URL(`${getSidecarBase()}/v1/jobs/${jobId}/log`);
  url.searchParams.set("since", String(since));
  const res = await fetch(url, { signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS) });
  if (!res.ok) throw new Error(`Job log failed: ${res.status}`);
  return (await res.json()) as JobLogSlice;
}

export type JobsQueueSnapshot = {
  max_concurrent: number;
  running: string[];
  pending: string[];
};

export async function fetchJobsQueue(): Promise<JobsQueueSnapshot> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/queue`, {
    signal: AbortSignal.timeout(SIDECAR_HTTP_SHORT_MS),
  });
  if (!res.ok) throw new Error(`Jobs queue failed: ${res.status}`);
  return (await res.json()) as JobsQueueSnapshot;
}

export type ClearJobsResult = {
  deleted: number;
  cancelled_active: number;
  project_dir: string | null;
};

/** Erase job history from SQLite (cancels active jobs first). */
export async function clearAllJobs(
  projectDir?: string,
): Promise<ClearJobsResult> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      projectDir ? { project_dir: projectDir } : {},
    ),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await throwJobsHttpError("Clear jobs failed", res);
  return (await res.json()) as ClearJobsResult;
}
