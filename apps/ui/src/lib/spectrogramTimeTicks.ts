import { niceAxisStep, targetAxisLabelCount } from "./spectrogramAxisNice";

export type TimeAxisTick = {
  xFrac: number;
  label: string;
};

export type TimeAxisMark = {
  xFrac: number;
  tSec: number;
  /** Present on major grid lines; minor marks are tick-only. */
  label: string | null;
};

export type TimeAxisOptions = {
  targetLabels?: number;
  plotWidthPx?: number;
  minLabelSpacingPx?: number;
  /**
   * MATLAB/Raven-style adaptive grid: major/minor steps densify as the
   * visible XLim (view window) shrinks.
   */
  scientificGrid?: boolean;
};

/** ~"00:00" at 8px mono needs ≥48px; use 52 for margin. */
const SCIENTIFIC_LABEL_MIN_PX = 52;
/** Keep minor ticks visually separable (~3.5 px). */
const SCIENTIFIC_MINOR_MIN_PX = 3.5;

function pxPerSec(span: number, plotWidthPx?: number): number {
  if (!plotWidthPx || plotWidthPx <= 0 || span <= 0) return 8;
  return plotWidthPx / span;
}

/** How many fractional seconds digits to show for a given tick step. */
export function timeAxisLabelDecimals(stepSec: number): number {
  if (!Number.isFinite(stepSec) || stepSec <= 0 || stepSec >= 1) return 0;
  if (stepSec >= 0.1) return 1;
  if (stepSec >= 0.01) return 2;
  return 3;
}

/**
 * Major label step for scientific grid (absolute-time aligned).
 * Uses MATLAB-style nice numbers that shrink with the view span (XLim).
 */
export function scientificTimeAxisMajorStepSec(
  span: number,
  plotWidthPx?: number,
): number {
  if (span <= 0) return 1;
  const targetLabels = plotWidthPx
    ? targetAxisLabelCount(plotWidthPx, SCIENTIFIC_LABEL_MIN_PX, {
        min: 3,
        max: 8,
      })
    : 6;
  let step = niceAxisStep(span / Math.max(1, targetLabels - 1));
  const pps = pxPerSec(span, plotWidthPx);
  while (step * pps < SCIENTIFIC_LABEL_MIN_PX && step < span) {
    const next = niceAxisStep(step * 2);
    if (next <= step) break;
    step = next;
  }
  return Math.max(0.001, step);
}

/**
 * Minor tick / grid step for scientific grid.
 * Densifies under zoom (e.g. 5 s → 1 s → 0.2 s) like MATLAB Axes.
 */
export function scientificTimeAxisMinorStepSec(
  span: number,
  plotWidthPx?: number,
): number {
  if (span <= 0) return 1;
  const major = scientificTimeAxisMajorStepSec(span, plotWidthPx);
  const pps = pxPerSec(span, plotWidthPx);
  let minor = major / 5;
  while (minor * pps < SCIENTIFIC_MINOR_MIN_PX && minor < major) {
    const next = niceAxisStep(minor * 2);
    if (next >= major - 1e-12) return major;
    if (next <= minor) break;
    minor = next;
  }
  if (minor > major) return major;
  return Math.max(0.001, minor);
}

function isScientificMajorTick(tSec: number, majorStep: number): boolean {
  if (majorStep <= 0) return true;
  const mod = ((tSec % majorStep) + majorStep) % majorStep;
  const tol = Math.max(1e-9, majorStep * 1e-4);
  return mod < tol || Math.abs(mod - majorStep) < tol;
}

/**
 * Always label the visible XLim edges so zoom/pan clearly updates axis values
 * (aligned major ticks alone can sit far from the window bounds).
 */
export function ensureVisibleWindowEdgeLabels(
  marks: TimeAxisMark[],
  viewStart: number,
  viewEnd: number,
  decimals: number,
): TimeAxisMark[] {
  const span = viewEnd - viewStart;
  if (!(span > 0)) return marks;

  const edgeDecimals = Math.max(
    decimals,
    timeAxisLabelDecimals(Math.max(0.001, span / 8)),
  );
  /** Drop a major label that sits too close to an edge label. */
  const collideTol = Math.max(span * 0.035, 0.05);
  const startLabel = formatSpectrogramAxisTime(viewStart, edgeDecimals);
  const endLabel = formatSpectrogramAxisTime(viewEnd, edgeDecimals);

  const filtered = marks.filter((m) => {
    if (!m.label) return true;
    if (Math.abs(m.tSec - viewStart) <= collideTol) return false;
    if (Math.abs(m.tSec - viewEnd) <= collideTol) return false;
    return true;
  });

  filtered.push({
    xFrac: 0,
    tSec: viewStart,
    label: startLabel,
  });
  filtered.push({
    xFrac: 1,
    tSec: viewEnd,
    label: endLabel,
  });

  filtered.sort((a, b) => a.tSec - b.tSec || a.xFrac - b.xFrac);
  return filtered;
}

/** Walk [viewStart, viewEnd] on an absolute-aligned step without float drift. */
function forEachAlignedStep(
  viewStart: number,
  viewEnd: number,
  step: number,
  fn: (tSec: number) => void,
): void {
  if (step <= 0 || viewEnd <= viewStart) return;
  const firstIdx = Math.ceil(viewStart / step - 1e-12);
  const lastIdx = Math.floor(viewEnd / step + 1e-12);
  for (let i = firstIdx; i <= lastIdx; i++) {
    fn(i * step);
  }
}

function resolveTargetLabels(
  countOrOptions?: number | TimeAxisOptions,
): number {
  if (typeof countOrOptions === "number") return countOrOptions;
  const opts = countOrOptions ?? {};
  if (opts.plotWidthPx != null && opts.plotWidthPx > 0) {
    return targetAxisLabelCount(
      opts.plotWidthPx,
      opts.minLabelSpacingPx ?? 72,
      { min: 3, max: 10 },
    );
  }
  return opts.targetLabels ?? 6;
}

/** Format absolute time on the spectrogram X axis (MM:SS[.fff] or H:MM:SS). */
export function formatSpectrogramAxisTime(
  sec: number,
  decimals = 0,
): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.max(0, Math.min(3, Math.floor(decimals)));
  const factor = 10 ** d;
  const total = Math.round(sec * factor) / factor;
  const whole = Math.floor(total + 1e-12);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const frac =
    d > 0 ? (total - whole).toFixed(d).slice(1) /* ".1" */ : "";
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${frac}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${frac}`;
}

function timeAxisLabelStep(
  viewStart: number,
  viewEnd: number,
  countOrOptions?: number | TimeAxisOptions,
): number {
  const span = viewEnd - viewStart;
  const count = resolveTargetLabels(countOrOptions);
  if (span <= 0 || count < 2) return 1;
  return Math.max(0.001, niceAxisStep(span / (count - 1)));
}

/** Finer tick marks on the time axis (subdivisions of the label step). */
export function timeAxisMarkStepSec(
  span: number,
  labelStep?: number,
): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const major = labelStep ?? niceAxisStep(span / 5);
  if (major <= 1) return 0.5;
  if (major <= 2) return 1;
  if (major <= 5) return major / 5;
  return niceAxisStep(major / 5);
}

/** Tick marks for the visible time window [viewStart, viewEnd]. */
export function timeAxisTicks(
  viewStart: number,
  viewEnd: number,
  countOrOptions?: number | TimeAxisOptions,
): TimeAxisTick[] {
  const span = viewEnd - viewStart;
  if (span <= 0) return [];

  const opts =
    typeof countOrOptions === "number"
      ? { targetLabels: countOrOptions }
      : countOrOptions ?? {};

  if (opts.scientificGrid) {
    const majorStep = scientificTimeAxisMajorStepSec(span, opts.plotWidthPx);
    const decimals = timeAxisLabelDecimals(majorStep);
    const ticks: TimeAxisTick[] = [];
    forEachAlignedStep(viewStart, viewEnd, majorStep, (t) => {
      const xFrac = (t - viewStart) / span;
      if (xFrac < -0.001 || xFrac > 1.001) return;
      ticks.push({
        xFrac: Math.max(0, Math.min(1, xFrac)),
        label: formatSpectrogramAxisTime(t, decimals),
      });
    });
    if (ticks.length === 0) {
      ticks.push({
        xFrac: 0,
        label: formatSpectrogramAxisTime(viewStart, decimals),
      });
      ticks.push({
        xFrac: 1,
        label: formatSpectrogramAxisTime(viewEnd, decimals),
      });
    }
    return ticks;
  }

  const count = resolveTargetLabels(countOrOptions);
  if (count < 2) return [];

  const step = timeAxisLabelStep(viewStart, viewEnd, countOrOptions);
  const decimals = timeAxisLabelDecimals(step);
  const ticks: TimeAxisTick[] = [];

  forEachAlignedStep(viewStart, viewEnd, step, (t) => {
    const xFrac = (t - viewStart) / span;
    if (xFrac < -0.001 || xFrac > 1.001) return;
    ticks.push({
      xFrac: Math.max(0, Math.min(1, xFrac)),
      label: formatSpectrogramAxisTime(t, decimals),
    });
  });

  if (ticks.length === 0) {
    ticks.push({
      xFrac: 0,
      label: formatSpectrogramAxisTime(viewStart, decimals),
    });
    ticks.push({
      xFrac: 1,
      label: formatSpectrogramAxisTime(viewEnd, decimals),
    });
  }

  return ticks;
}

/** Major labels + minor tick marks along the horizontal axis. */
export function timeAxisMarks(
  viewStart: number,
  viewEnd: number,
  countOrOptions?: number | TimeAxisOptions,
): TimeAxisMark[] {
  const span = viewEnd - viewStart;
  if (span <= 0) return [];

  const opts =
    typeof countOrOptions === "number"
      ? { targetLabels: countOrOptions }
      : countOrOptions ?? {};

  if (opts.scientificGrid) {
    const majorStep = scientificTimeAxisMajorStepSec(span, opts.plotWidthPx);
    const markStep = scientificTimeAxisMinorStepSec(span, opts.plotWidthPx);
    const decimals = timeAxisLabelDecimals(majorStep);
    const marks: TimeAxisMark[] = [];

    forEachAlignedStep(viewStart, viewEnd, markStep, (t) => {
      const xFrac = (t - viewStart) / span;
      if (xFrac < -0.001 || xFrac > 1.001) return;
      const tRounded = Math.round(t * 1e6) / 1e6;
      const major = isScientificMajorTick(tRounded, majorStep);
      marks.push({
        xFrac: Math.max(0, Math.min(1, xFrac)),
        tSec: tRounded,
        label: major ? formatSpectrogramAxisTime(tRounded, decimals) : null,
      });
    });

    if (marks.length === 0) {
      return [
        {
          xFrac: 0,
          tSec: viewStart,
          label: formatSpectrogramAxisTime(viewStart, decimals),
        },
        {
          xFrac: 1,
          tSec: viewEnd,
          label: formatSpectrogramAxisTime(viewEnd, decimals),
        },
      ];
    }
    return ensureVisibleWindowEdgeLabels(marks, viewStart, viewEnd, decimals);
  }

  const labeled = timeAxisTicks(viewStart, viewEnd, countOrOptions);
  const labelBySec = new Map<number, string>();
  for (const tick of labeled) {
    const tSec = viewStart + tick.xFrac * span;
    labelBySec.set(Math.round(tSec * 1000) / 1000, tick.label);
  }

  const labelStep = timeAxisLabelStep(viewStart, viewEnd, countOrOptions);
  const markStep = timeAxisMarkStepSec(span, labelStep);
  const marks: TimeAxisMark[] = [];
  const labelTolerance = markStep * 0.05;

  forEachAlignedStep(viewStart, viewEnd, markStep, (t) => {
    const xFrac = (t - viewStart) / span;
    if (xFrac < -0.001 || xFrac > 1.001) return;
    const tRounded = Math.round(t * 1000) / 1000;
    let label: string | null = labelBySec.get(tRounded) ?? null;
    if (!label) {
      for (const [labeledSec, labeledText] of labelBySec) {
        if (Math.abs(labeledSec - t) <= labelTolerance) {
          label = labeledText;
          break;
        }
      }
    }
    marks.push({
      xFrac: Math.max(0, Math.min(1, xFrac)),
      tSec: tRounded,
      label,
    });
  });

  if (marks.length === 0 && labeled.length > 0) {
    return labeled.map((tick) => ({
      xFrac: tick.xFrac,
      tSec: viewStart + tick.xFrac * span,
      label: tick.label,
    }));
  }

  return marks;
}
