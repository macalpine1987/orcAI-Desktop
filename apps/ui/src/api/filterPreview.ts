import { getSidecarBase } from "./sidecar";
import type { CallDurationLimits } from "../lib/callDurationLimits";

export type FilterPreviewClass = {
  label: string;
  found: number;
  keep: number;
  drop: number;
  durations: number[];
};

export type FilterPreviewResult = {
  total: { found: number; keep: number; drop: number };
  classes: FilterPreviewClass[];
  files_ok: number;
  files_missing: string[];
};

export async function fetchFilterDefaults(): Promise<CallDurationLimits> {
  const res = await fetch(`${getSidecarBase()}/v1/filter-predictions/defaults`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Filter defaults failed: ${res.status}`);
  const data = (await res.json()) as { limits: CallDurationLimits };
  return data.limits;
}

export async function fetchFilterPreview(body: {
  predictedLabels: string[];
  limits: CallDurationLimits;
  labelSuffix?: string;
}): Promise<FilterPreviewResult> {
  const res = await fetch(`${getSidecarBase()}/v1/filter-predictions/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predicted_labels: body.predictedLabels,
      call_duration_limits: body.limits,
      label_suffix: body.labelSuffix ?? "*",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Filter preview failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as FilterPreviewResult;
}

export async function readTextFile(path: string): Promise<string | null> {
  const url = new URL(`${getSidecarBase()}/v1/fs/read-text`);
  url.searchParams.set("path", path);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read failed: ${res.status}`);
  const data = (await res.json()) as { content: string };
  return data.content;
}

export async function writeTextFile(
  path: string,
  content: string,
  timeoutMs = 30_000,
): Promise<string> {
  const res = await fetch(`${getSidecarBase()}/v1/fs/write-text`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Write failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { path: string };
  return data.path;
}
