import { getSidecarBase } from "./sidecar";
import { liveLargeWavOptimize } from "../lib/integrationSettings";
import { SPECTROGRAM_DISPLAY_KIND } from "../lib/spectrogramView";

export type SpectrogramMeta = {
  path: string;
  duration_sec: number;
  sample_rate: number;
  channels: number | null;
  /** orcAI working sample rate (may differ from WAV). */
  effective_sample_rate?: number;
  /** Top of frequency axis (orcAI freq_range upper, typically 16000). */
  axis_max_hz?: number;
};

export type SpectrogramDisplayKind = "orcai" | "linear" | "log_mel";
export type SpectrogramColormap = "inferno" | "viridis" | "gray";

export type SpectrogramTileParams = {
  path: string;
  t0?: number;
  t1?: number;
  width?: number;
  height?: number;
  channel?: number;
  orcai_parameter?: string;
  display_kind?: SpectrogramDisplayKind;
  colormap?: SpectrogramColormap;
  vmin?: number;
  vmax?: number;
  /** Cache-bust token (not sent to API). */
  _epoch?: number;
};

export type SpectrogramHistogram = {
  bins: number[];
  t0: number;
  t1: number;
  display_kind: string;
};

function appendWindowedQuery(url: URL): void {
  if (liveLargeWavOptimize()) {
    url.searchParams.set("windowed", "true");
  }
}

const META_CACHE_MAX = 24;
const metaCache = new Map<string, SpectrogramMeta>();

function metaCacheKey(wavPath: string, orcaiParameter?: string | null): string {
  return `${wavPath}\0${orcaiParameter?.trim() ?? ""}`;
}

function rememberSpectrogramMeta(
  meta: SpectrogramMeta,
  requestPath: string,
  orcaiParameter?: string | null,
): void {
  metaCache.set(metaCacheKey(meta.path, orcaiParameter), meta);
  metaCache.set(metaCacheKey(requestPath, orcaiParameter), meta);
  while (metaCache.size > META_CACHE_MAX) {
    const oldest = metaCache.keys().next().value;
    if (oldest == null) break;
    metaCache.delete(oldest);
  }
}

export function peekSpectrogramMeta(
  wavPath: string,
  orcaiParameter?: string | null,
): SpectrogramMeta | null {
  return metaCache.get(metaCacheKey(wavPath, orcaiParameter)) ?? null;
}

export async function fetchSpectrogramMeta(
  wavPath: string,
  options?: { orcaiParameter?: string | null; signal?: AbortSignal },
): Promise<SpectrogramMeta> {
  const url = new URL(`${getSidecarBase()}/v1/spectrogram/meta`);
  url.searchParams.set("path", wavPath);
  if (options?.orcaiParameter?.trim()) {
    url.searchParams.set("orcai_parameter", options.orcaiParameter.trim());
  }
  const signal =
    options?.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(30_000)
      : undefined);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Spectrogram meta failed: ${res.status} ${detail}`);
  }
  const meta = (await res.json()) as SpectrogramMeta;
  rememberSpectrogramMeta(meta, wavPath, options?.orcaiParameter);
  return meta;
}

/** Ensure sidecar disk+RAM cache for a WAV (fire-and-forget friendly). */
export async function warmSpectrogramCache(
  wavPath: string,
  options?: {
    channel?: number;
    orcaiParameter?: string | null;
    signal?: AbortSignal;
  },
): Promise<{ status: string; built: boolean }> {
  const url = new URL(`${getSidecarBase()}/v1/spectrogram/warm`);
  url.searchParams.set("path", wavPath);
  url.searchParams.set("channel", String(options?.channel ?? 1));
  if (options?.orcaiParameter?.trim()) {
    url.searchParams.set("orcai_parameter", options.orcaiParameter.trim());
  }
  appendWindowedQuery(url);
  const res = await fetch(url, {
    method: "POST",
    signal: options?.signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Spectrogram warm failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as { status: string; built: boolean };
}

export async function fetchSpectrogramHistogram(
  params: Omit<
    SpectrogramTileParams,
    "width" | "height" | "colormap" | "vmin" | "vmax" | "_epoch"
  > & {
    bins?: number;
  },
): Promise<SpectrogramHistogram> {
  const url = new URL(`${getSidecarBase()}/v1/spectrogram/histogram`);
  url.searchParams.set("path", params.path);
  url.searchParams.set("t0", String(params.t0 ?? 0));
  if (params.t1 != null) url.searchParams.set("t1", String(params.t1));
  url.searchParams.set("channel", String(params.channel ?? 1));
  url.searchParams.set("display_kind", params.display_kind ?? "orcai");
  url.searchParams.set("bins", String(params.bins ?? 18));
  if (params.orcai_parameter) {
    url.searchParams.set("orcai_parameter", params.orcai_parameter);
  }
  appendWindowedQuery(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Spectrogram histogram failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as SpectrogramHistogram;
}

export function spectrogramTileUrl(params: SpectrogramTileParams): string {
  const url = new URL(`${getSidecarBase()}/v1/spectrogram/tile`);
  url.searchParams.set("path", params.path);
  url.searchParams.set("t0", String(params.t0 ?? 0));
  if (params.t1 != null) url.searchParams.set("t1", String(params.t1));
  url.searchParams.set("width", String(params.width ?? 800));
  url.searchParams.set("height", String(params.height ?? 256));
  url.searchParams.set("channel", String(params.channel ?? 1));
  url.searchParams.set("display_kind", SPECTROGRAM_DISPLAY_KIND);
  const cmap = params.colormap ?? "inferno";
  url.searchParams.set("colormap", cmap);
  url.searchParams.set("vmin", String(params.vmin ?? 0));
  url.searchParams.set("vmax", String(params.vmax ?? 1));
  if (params.orcai_parameter) {
    url.searchParams.set("orcai_parameter", params.orcai_parameter);
  }
  appendWindowedQuery(url);
  if (params._epoch != null) {
    url.searchParams.set("_", String(params._epoch));
    url.searchParams.set(
      "v",
      `${params._epoch}-${SPECTROGRAM_DISPLAY_KIND}-${cmap}`,
    );
  }
  return url.toString();
}

export function spectrogramWaveformUrl(
  params: Omit<
    SpectrogramTileParams,
    | "height"
    | "orcai_parameter"
    | "display_kind"
    | "colormap"
    | "vmin"
    | "vmax"
  > & {
    height?: number;
    _epoch?: number;
  },
): string {
  const url = new URL(`${getSidecarBase()}/v1/spectrogram/waveform`);
  url.searchParams.set("path", params.path);
  url.searchParams.set("t0", String(params.t0 ?? 0));
  if (params.t1 != null) url.searchParams.set("t1", String(params.t1));
  url.searchParams.set("width", String(params.width ?? 800));
  url.searchParams.set("height", String(params.height ?? 48));
  url.searchParams.set("channel", String(params.channel ?? 1));
  if (params._epoch != null) {
    url.searchParams.set("_", String(params._epoch));
  }
  return url.toString();
}
