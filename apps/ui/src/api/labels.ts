import { getSidecarBase } from "./sidecar";
import { liveLargeWavOptimize } from "../lib/integrationSettings";

export type LabelSegment = {
  start: number;
  stop: number;
  label: string;
  mean_p: number | null;
  label_source: string | null;
  start_sec?: number;
  stop_sec?: number;
  /** Time–frequency overlay (Hz), from sidecar energy analysis. */
  hz_min?: number;
  hz_max?: number;
};

export type LabelTimeUnit = "seconds" | "frames";

export type LabelsTfBoundsMeta = {
  computed: number;
  skipped: number;
  warnings: string[];
};

export type LabelsPreview = {
  path: string;
  wav_path: string | null;
  delta_t: number | null;
  time_unit?: LabelTimeUnit;
  segment_count: number;
  labels: Record<string, number>;
  segments: LabelSegment[];
  tf_bounds?: LabelsTfBoundsMeta | null;
};

export async function fetchLabelsPreview(
  labelPath: string,
  options?: {
    wavPath?: string;
    channel?: number;
    orcaiParameter?: string;
    computeTfBounds?: boolean;
    signal?: AbortSignal;
  },
): Promise<LabelsPreview> {
  const url = new URL(`${getSidecarBase()}/v1/labels/preview`);
  url.searchParams.set("path", labelPath);
  if (options?.wavPath) url.searchParams.set("wav_path", options.wavPath);
  if (options?.channel != null) {
    url.searchParams.set("channel", String(options.channel));
  }
  if (options?.orcaiParameter) {
    url.searchParams.set("orcai_parameter", options.orcaiParameter);
  }
  if (options?.computeTfBounds === false) {
    url.searchParams.set("compute_tf_bounds", "false");
  }
  if (liveLargeWavOptimize()) {
    url.searchParams.set("windowed", "true");
  }
  const timeoutMs = 120_000;
  let signal = options?.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (signal == null) {
    signal = AbortSignal.timeout(timeoutMs);
  } else {
    const combined = new AbortController();
    const onAbort = () => combined.abort();
    if (signal.aborted) combined.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
    timeoutId = setTimeout(() => combined.abort(), timeoutMs);
    signal = combined.signal;
  }
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Labels preview failed: ${res.status} ${detail}`);
    }
    return (await res.json()) as LabelsPreview;
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

export type ExportAudacityResult = {
  output_path?: string;
  line_count?: number;
  content?: string;
  suggested_name?: string;
};

export async function exportAudacityLabels(params: {
  labelPath: string;
  wavPath?: string;
  outputPath?: string;
  channel?: number;
  orcaiParameter?: string;
}): Promise<ExportAudacityResult> {
  const res = await fetch(`${getSidecarBase()}/v1/labels/export-audacity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label_path: params.labelPath,
      wav_path: params.wavPath,
      output_path: params.outputPath,
      channel: params.channel ?? 1,
      orcai_parameter: params.orcaiParameter,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Audacity export failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as ExportAudacityResult;
}
