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

/** True when both ends are set and min > max (invalid range for orcAI filter). */
export function isDurationPairInverted(
  min: DurationBound,
  max: DurationBound,
): boolean {
  return min != null && max != null && min > max;
}

export function limitsHaveInvertedPairs(limits: CallDurationLimits): boolean {
  return Object.values(limits).some(([min, max]) =>
    isDurationPairInverted(min, max),
  );
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

export type HistogramBin = {
  start: number;
  end: number;
  count: number;
  keep: number;
};

/** One wider column past the main axis. `end` null means “and longer”. */
export type HistogramTail = {
  start: number;
  end: number | null;
  count: number;
  keep: number;
};

export type DurationHistogram = {
  bins: HistogramBin[];
  tails: HistogramTail[];
  span: number;
  binWidth: number;
};

export type DurationClassRow = {
  label: string;
  found: number;
  keep: number;
  drop: number;
  durations: number[];
};

/** Dragging the brush to the last 2% of the plot leaves max open (JSON null). */
export const HIST_OPEN_MAX_FRACTION = 0.98;

/** Short calls keep a 0–2 s axis. Longer calls round up to the next nice span. */
export const HIST_BASE_SPAN_SEC = 2;

/** A few very long calls do not flatten the axis past this. */
export const HIST_SPAN_CAP_SEC = 30;

/** Spans the axis may use, in seconds. */
export const HIST_NICE_SPANS = [2, 4, 8, 12, 16, 20, 30] as const;

/** Column count stays in this range so a bar is wide enough to read. */
export const HIST_BIN_COUNT_MIN = 16;
export const HIST_BIN_COUNT_MAX = 40;

const PUBLICATION_CLASS_NAMES = new Set(
  Object.keys(ORCAI_V1_PUBLICATION_LIMITS).filter((key) => key !== "default"),
);

/** Classes with detections, built-in names first, then the preview order. */
export function filterTableClassKeys(
  classes: readonly { label: string; found: number }[],
): string[] {
  const found = classes.filter((row) => row.found > 0 && row.label !== "default");
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const key of FILTER_CLASS_ORDER) {
    if (!found.some((row) => row.label === key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  for (const row of found) {
    if (seen.has(row.label)) continue;
    seen.add(row.label);
    ordered.push(row.label);
  }
  return ordered;
}

/** Found classes that still fall through to the `default` row. */
export function classesUsingDefaultLimit(
  classes: readonly DurationClassRow[],
  limits: CallDurationLimits,
): DurationClassRow[] {
  const compact = collapseNoOpClassLimits(limits);
  const byLabel = new Map<string, DurationClassRow>();
  for (const row of classes) {
    if (row.found > 0 && row.label !== "default") byLabel.set(row.label, row);
  }
  return filterTableClassKeys(classes)
    .filter((key) => !(key in compact))
    .flatMap((key) => {
      const row = byLabel.get(key);
      return row ? [row] : [];
    });
}

/**
 * Durations drawn for the selected row.
 * `default` draws one class that uses it; several classes are not mixed.
 */
export function durationsForSelectedLimit(
  selected: string,
  classes: readonly DurationClassRow[],
  limits: CallDurationLimits,
): number[] {
  if (selected !== "default") {
    return classes.find((row) => row.label === selected)?.durations ?? [];
  }
  const shared = classesUsingDefaultLimit(classes, limits);
  if (shared.length !== 1) return [];
  return shared[0]?.durations ?? [];
}

/** True when every detection belongs to the seven publication classes. */
export function publicationExampleFitsClasses(
  classes: readonly { label: string; found: number }[],
): boolean {
  const found = classes.filter((row) => row.found > 0 && row.label !== "default");
  if (found.length === 0) return false;
  return found.every((row) => PUBLICATION_CLASS_NAMES.has(row.label));
}

/** Same edges as orcAI `_check_duration` with `delta_t = 1`. Null min is 0, null max is open. */
export function durationKept(
  duration: number,
  min: DurationBound,
  max: DurationBound,
): boolean {
  const lo = min ?? 0;
  const hi = max ?? Number.POSITIVE_INFINITY;
  return duration >= lo && duration <= hi;
}

function snapStepAt(seconds: number): number {
  if (seconds < 0.2) return 0.01;
  if (seconds < 2) return 0.05;
  return 0.1;
}

export function snapDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds < 0.2) return Math.round(seconds * 100) / 100;
  if (seconds < 2) return Math.round(seconds * 20) / 20;
  return Math.round(seconds * 10) / 10;
}

/** Next snapped duration strictly above `seconds`. A 0.01 nudge is not enough: above 0.2 s the grid is 0.05 s. */
export function nextSnapAbove(seconds: number, step?: number): number {
  if (step != null && step > 0) {
    const base = snapToStep(Math.max(0, seconds), step);
    const raised = snapToStep(base + step, step);
    return raised > base ? raised : Number((base + step).toFixed(2));
  }
  const base = snapDuration(Math.max(0, seconds));
  const grid = snapStepAt(base);
  const raised = snapDuration(base + grid);
  if (raised > base) return raised;
  return Number((base + grid).toFixed(2));
}

/** Previous snapped duration strictly below `seconds`, or 0. */
export function previousSnapBelow(seconds: number, step?: number): number {
  if (step != null && step > 0) {
    const base = snapToStep(Math.max(0, seconds), step);
    if (base <= 0) return 0;
    const lowered = snapToStep(Math.max(0, base - step), step);
    return lowered < base ? lowered : Math.max(0, Number((base - step).toFixed(2)));
  }
  const base = snapDuration(Math.max(0, seconds));
  if (base <= 0) return 0;
  const grid = snapStepAt(Math.max(0, base - 1e-9));
  const lowered = snapDuration(Math.max(0, base - grid));
  if (lowered < base) return lowered;
  return Math.max(0, Number((base - grid).toFixed(2)));
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

/** Snap to the histogram column width. The column edge and the limit are the same instant. */
export function snapToStep(seconds: number, step: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !(step > 0)) return 0;
  const places = step >= 1 ? 0 : 2;
  return Number((Math.round(seconds / step) * step).toFixed(places));
}

export function boundsFromBrush(
  a: number,
  b: number,
  span: number,
  step?: number,
): [DurationBound, DurationBound] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const snap = (value: number) =>
    step != null && step > 0 ? snapToStep(value, step) : snapDuration(value);
  const min = snap(Math.max(0, lo));
  if (hi >= span * HIST_OPEN_MAX_FRACTION) return [min, null];
  let max = snap(Math.max(0, hi));
  // A brush thinner than one column used to drop the upper limit
  // (null = no maximum). Keep a closed interval one column wide.
  if (max <= min) max = nextSnapAbove(min, step);
  if (span > 0 && max >= span * HIST_OPEN_MAX_FRACTION) return [min, null];
  return [min, max];
}

/** Nearest-rank percentile of finite durations. Empty input is 0. */
export function durationPercentile(durations: readonly number[], percentile: number): number {
  const values = durations.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const rank = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(percentile * values.length) - 1),
  );
  return values[rank] ?? 0;
}

/** Axis that covers the bulk of the calls. Limits do not move it. */
export function histogramSpanFor(p95Sec: number): number {
  const raw = Math.min(
    HIST_SPAN_CAP_SEC,
    Math.max(HIST_BASE_SPAN_SEC, Number.isFinite(p95Sec) ? p95Sec : 0),
  );
  for (const nice of HIST_NICE_SPANS) {
    if (nice >= raw - 1e-9) return nice;
  }
  return HIST_SPAN_CAP_SEC;
}

/** Finest column width that yields 16–40 columns on `span`. */
export function histogramBinWidth(span: number): number {
  for (const width of [0.05, 0.1, 0.25, 0.5, 1, 2, 5]) {
    const count = span / width;
    if (count >= HIST_BIN_COUNT_MIN && count <= HIST_BIN_COUNT_MAX) return width;
  }
  return 1;
}

export function formatHistSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0";
  const rounded = Math.round(seconds * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function histogramCountTicks(peak: number): number[] {
  if (peak <= 0) return [0];
  if (peak === 1) return [1, 0];
  const mid = Math.round(peak / 2);
  if (mid <= 0 || mid >= peak) return [peak, 0];
  return [peak, mid, 0];
}

export function durationHistogram(
  durations: number[],
  limits: [DurationBound, DurationBound] = [null, null],
  spanOverride?: number | null,
): DurationHistogram {
  const [min, max] = limits;
  const span =
    spanOverride != null && spanOverride > 0
      ? spanOverride
      : histogramSpanFor(durationPercentile(durations, 0.95));
  const binWidth = histogramBinWidth(span);
  const binCount = Math.max(1, Math.round(span / binWidth));
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: (i * span) / binCount,
    end: ((i + 1) * span) / binCount,
    count: 0,
    keep: 0,
  }));
  const split = span * 1.5;
  const tails: HistogramTail[] = [
    { start: span, end: split, count: 0, keep: 0 },
    { start: split, end: null, count: 0, keep: 0 },
  ];
  for (const raw of durations) {
    if (!Number.isFinite(raw) || raw < 0) continue;
    const kept = durationKept(raw, min, max);
    if (raw > span) {
      const band = raw <= split ? tails[0]! : tails[1]!;
      band.count += 1;
      if (kept) band.keep += 1;
      continue;
    }
    const idx = Math.min(binCount - 1, Math.floor((raw / span) * binCount));
    const bin = bins[idx]!;
    bin.count += 1;
    if (kept) bin.keep += 1;
  }
  return { bins, tails, span, binWidth };
}
