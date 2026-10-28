import { getSidecarBase } from "./sidecar";
import type { JobRecord } from "./jobs";

export type RecordingTablePreview = {
  path: string;
  row_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
};

export type CreateRecordingTableParams = {
  base_dir_recording: string;
  base_dir_annotation?: string;
  output_path?: string;
  default_channel?: number;
  remove_duplicate_filenames?: boolean;
  overwrite?: boolean;
};

export async function createRecordingTableJob(
  params: CreateRecordingTableParams,
): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/create-recording-table`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`create-recording-table failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as JobRecord;
}

export async function fetchRecordingTablePreview(
  path: string,
): Promise<RecordingTablePreview> {
  const url = new URL(`${getSidecarBase()}/v1/recording-tables/preview`);
  url.searchParams.set("path", path);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  return (await res.json()) as RecordingTablePreview;
}
