import { getSidecarBase } from "./sidecar";

export type PredictionResultItem = {
  label_path: string;
  kind?: string;
  name?: string;
  source?: string;
  wav_path?: string | null;
  model?: string | null;
  command?: string;
  job_id?: string;
  created_at?: number;
};

export type PredictionsListResponse = {
  items: PredictionResultItem[];
  db_path: string | null;
  scan_dir: string | null;
};

export type TestMetricsFile = {
  path: string;
  name: string;
  size_bytes: number;
  data?: Record<string, unknown> | null;
};

export type TestMetricsResponse = {
  files: TestMetricsFile[];
  scan_roots: string[];
};

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
}): Promise<ResultsSummaryResponse> {
  const url = new URL(`${getSidecarBase()}/v1/results/summary`);
  url.searchParams.set("project_dir", options.projectDir);
  url.searchParams.set("source", options.source);
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Results summary failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as ResultsSummaryResponse;
}

export async function fetchTestMetrics(options: {
  modelDir?: string;
  projectDir?: string;
  dataDir?: string;
}): Promise<TestMetricsResponse> {
  const url = new URL(`${getSidecarBase()}/v1/results/test-metrics`);
  if (options.modelDir) url.searchParams.set("model_dir", options.modelDir);
  if (options.projectDir) url.searchParams.set("project_dir", options.projectDir);
  if (options.dataDir) url.searchParams.set("data_dir", options.dataDir);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Test metrics failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as TestMetricsResponse;
}

export async function fetchPredictionResults(options?: {
  projectDir?: string;
  directory?: string;
  limit?: number;
}): Promise<PredictionsListResponse> {
  const url = new URL(`${getSidecarBase()}/v1/results/predictions`);
  if (options?.projectDir) {
    url.searchParams.set("project_dir", options.projectDir);
  }
  if (options?.directory) {
    url.searchParams.set("directory", options.directory);
  }
  if (options?.limit != null) {
    url.searchParams.set("limit", String(options.limit));
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Results list failed: ${res.status}`);
  return (await res.json()) as PredictionsListResponse;
}
