import { SIGNAL_TYPE_ABBREVIATION_ORDER } from "./labelColors";

/** Seconds bound. Empty min/max in the UI is JSON `null` (orcAI treats min null as 0, max as inf). */
export type DurationBound = number | null;

export type CallDurationLimits = Record<string, [DurationBound, DurationBound]>;

export const FILTER_CLASS_ORDER: readonly string[] = SIGNAL_TYPE_ABBREVIATION_ORDER;

/** Editor Reset / no-op engine file: only `default`. Per-class `[0, null]` would shadow it. */
export const ORCAI_DEFAULT_DURATION_LIMITS: CallDurationLimits = {
  default: [0, null],
};

/** Publication starting point, not a new engine default. Max stays open. */
export const ORCAI_V1_PUBLICATION_LIMITS: CallDurationLimits = {
  default: [0, null],
  BR: [0.4, null],
  BUZZ: [0.05, null],
  HERDING: [1, null],
  PHS: [0.1, null],
  SS: [0.05, null],
  TAILSLAP: [0.05, null],
  WHISTLE: [0.1, null],
};

export function parseBound(raw: unknown): DurationBound {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseLimitsJson(text: string): CallDurationLimits {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("call_duration_limits must be a JSON object");
  }
  const out: CallDurationLimits = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length < 1) continue;
    out[key] = [parseBound(value[0]), parseBound(value[1])];
  }
  if (!("default" in out)) out.default = [null, null];
  return out;
}

function isNoOpDurationPair(pair: [DurationBound, DurationBound] | undefined): boolean {
  if (!pair) return true;
  const [min, max] = pair;
  return (min == null || min === 0) && max == null;
}

/**
 * Engine default_call_duration_limits.json lists every class as [0, null], which
 * shadows `default` in `_check_duration`. Drop those no-op class rows so an edit
 * to `default` applies. Keep class [0, null] when default itself has a limit.
 */
export function collapseNoOpClassLimits(limits: CallDurationLimits): CallDurationLimits {
  const def = limits.default ?? [null, null];
  const classes = Object.entries(limits).filter(([key]) => key !== "default");
  if (classes.some(([, pair]) => !isNoOpDurationPair(pair))) {
    return { default: def, ...Object.fromEntries(classes) };
  }
  if (!isNoOpDurationPair(def)) {
    return { default: def, ...Object.fromEntries(classes) };
  }
  return { default: def };
}

export function serializeLimitsJson(limits: CallDurationLimits): string {
  const compact = collapseNoOpClassLimits(limits);
  const keys = [
    "default",
    ...FILTER_CLASS_ORDER.filter((k) => k in compact),
    ...Object.keys(compact).filter(
      (k) => k !== "default" && !FILTER_CLASS_ORDER.includes(k),
    ),
  ];
  const body: Record<string, [DurationBound, DurationBound]> = {};
  for (const key of keys) {
    const pair = compact[key] ?? [null, null];
    body[key] = [pair[0], pair[1]];
  }
  return `${JSON.stringify(body, null, 4)}\n`;
}

/** True when every class is [0|null, null] — orcAI will not drop any detection. */
export function isNoOpDurationLimits(limits: CallDurationLimits): boolean {
  const pairs = Object.values(limits);
  if (pairs.length === 0) return true;
  return pairs.every(([min, max]) => {
    const noMin = min == null || min === 0;
    const noMax = max == null;
    return noMin && noMax;
  });
}

export function boundToInput(value: DurationBound): string {
  if (value == null) return "";
  return String(value);
}

/** Incomplete typing (`0.` / `0,06`) that must stay visible until blur. */
export function isDurationBoundDraft(raw: string): boolean {
  return /^\d*[.,]?\d*$/.test(raw.trim());
}

export function inputToBound(raw: string): DurationBound {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function filteredOutputPath(predictedLabelsPath: string): string {
  const normalized = predictedLabelsPath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? predictedLabelsPath.slice(0, slash + 1) : "";
  const name =
    slash >= 0 ? predictedLabelsPath.slice(slash + 1) : predictedLabelsPath;
  const stem = name.replace(/\.txt$/i, "");
  return `${dir}${stem}_filtered.txt`;
}

/** Path the filter job will write — custom ``-o`` or the default ``*_filtered.txt``. */
export function resolveFilterJobOutputPath(
  predictedLabelsPath: string,
  outputFile?: string | null,
): string {
  const custom = (outputFile ?? "").trim();
  if (custom && custom !== "default") return custom;
  return filteredOutputPath(predictedLabelsPath);
}

export type HistogramBin = { start: number; end: number; count: number };

/** Dragging the brush to the last 2% of the plot leaves max open (JSON null). */
export const HIST_OPEN_MAX_FRACTION = 0.98;

export function snapDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds < 0.2) return Math.round(seconds * 100) / 100;
  if (seconds < 2) return Math.round(seconds * 20) / 20;
  return Math.round(seconds * 10) / 10;
}

export function durationFromPlotX(
  clientX: number,
  plotLeft: number,
  plotWidth: number,
  span: number,
): number {
  if (plotWidth <= 0 || span <= 0) return 0;
  const t = Math.min(1, Math.max(0, (clientX - plotLeft) / plotWidth));
  return t * span;
}

export function boundsFromBrush(
  a: number,
  b: number,
  span: number,
): [DurationBound, DurationBound] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const min = snapDuration(Math.max(0, lo));
  if (hi >= span * HIST_OPEN_MAX_FRACTION) return [min, null];
  const max = snapDuration(Math.max(0, hi));
  if (max <= min) return [min, null];
  return [min, max];
}

export function durationHistogram(
  durations: number[],
  binCount = 16,
): HistogramBin[] {
  if (binCount < 2) return [];
  const vals = durations.filter((d) => Number.isFinite(d) && d >= 0);
  if (vals.length === 0) {
    return Array.from({ length: binCount }, (_, i) => ({
      start: i,
      end: i + 1,
      count: 0,
    }));
  }
  const max = Math.max(...vals, 0.001);
  const width = max / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: i * width,
    end: (i + 1) * width,
    count: 0,
  }));
  for (const d of vals) {
    const idx = Math.min(binCount - 1, Math.floor(d / width));
    bins[idx]!.count += 1;
  }
  return bins;
}
