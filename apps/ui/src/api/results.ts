import { getSidecarBase } from "./sidecar";

export type ResultsSource = "predicted" | "filtered" | "annotations";

export type ResultsSummaryRow = {
  id: string;
  recording: string;
  wav_path: string | null;
  label_path: string;
  label: string;
  start_sec: number;
  stop_sec: number;
  duration_sec: number;
  mean_p: number | null;
  model: string | null;
  channel: number;
  kind?: "predicted" | "filtered" | "annotation";
};

export type ResultsClassBucket = {
  label: string;
  count: number;
  duration_sec: number;
};

export type ResultsSummaryTotals = {
  detection_count: number;
  recording_count: number;
  duration_sec: number;
  mean_p: number | null;
  models: string[];
  thresholds: number[];
};

export type ResultsSummaryResponse = {
  source: ResultsSource;
  scan_dir: string;
  files_total: number;
  files_ok: number;
  truncated: boolean;
  files_failed?: number;
  summary: ResultsSummaryTotals;
  classes: ResultsClassBucket[];
  recordings: string[];
  rows: ResultsSummaryRow[];
};

export async function fetchResultsSummary(options: {
  projectDir: string;
  source: ResultsSource;
  fresh?: boolean;
}): Promise<ResultsSummaryResponse> {
  const url = new URL(`${getSidecarBase()}/v1/results/summary`);
  url.searchParams.set("project_dir", options.projectDir);
  url.searchParams.set("source", options.source);
  if (options.fresh) url.searchParams.set("fresh", "true");
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Results summary failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as ResultsSummaryResponse;
}
