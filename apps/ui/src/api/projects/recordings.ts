import { getSidecarBase } from "../sidecar";
import { withJobVerbosity } from "../../lib/integrationSettings";
import type { JobRecord } from "../jobs";
import type {
  InitProjectParams,
  ProjectRecording,
  ProjectSyncTableOptions,
} from "./types";
import { parseError } from "./parseError";

export async function fetchProjectRecordings(
  id: string,
): Promise<ProjectRecording[]> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recordings`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { recordings: ProjectRecording[] };
  return data.recordings;
}

/** Queue background import (WAV copy into recordings/). */
export async function importProjectRecordingsJob(
  id: string,
  paths: string[],
): Promise<{ job_id: string; job: JobRecord; async: boolean }> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recordings/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as {
    job_id: string;
    job: JobRecord;
    async?: boolean;
  };
  return { job_id: data.job_id, job: data.job, async: data.async ?? true };
}

export async function deleteProjectRecordings(
  id: string,
  options: { filenames?: string[]; delete_all?: boolean },
): Promise<{ deleted: string[]; count: number; skipped?: string[] }> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recordings/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filenames: options.filenames ?? [],
        delete_all: options.delete_all ?? false,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    deleted: string[];
    count: number;
    skipped?: string[];
  };
}

export async function startProjectInitJob(id: string): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/init`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as JobRecord;
}

export async function startProjectSyncTableJob(
  id: string,
  options: ProjectSyncTableOptions = {},
): Promise<JobRecord> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recordings/sync-table`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as JobRecord;
}

export async function initProjectJob(
  params: InitProjectParams,
): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withJobVerbosity({ ...params })),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`init failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as JobRecord;
}
