import { SPECTROGRAM_SEGMENT_SEC } from "./spectrogramView";
import { ORCAI_DEFAULT_AXIS_MAX_HZ } from "./spectrogramAxis";
import { niceAxisStep, targetAxisLabelCount } from "./spectrogramAxisNice";

export type FrequencyAxisTick = {
  yFrac: number;
  /** kHz label (0 at bottom, max at top); empty for unlabeled minor ticks. */
  label: string;
  khz: number;
  major?: boolean;
};

export type FrequencyAxisTickOptions = {
  plotHeightPx?: number;
  minLabelSpacingPx?: number;
  freqMinHz?: number;
  freqMaxHz?: number;
  /**
   * Visible time-window span (XLim width). When set with auto-tick, Y label
   * density follows time-zoom magnification while YLim stays fixed 0–16 kHz.
   */
  timeViewSpanSec?: number;
  /** Segment / default span used as magnification reference (default 200 s). */
  segmentSpanSec?: number;
  /**
   * Fixed major label step in kHz (m04 scientific: 2 → 16,14,…,2).
   * When set, skips auto density and uses this step.
   */
  labelStepKhz?: number;
};

/** Step on the vertical axis (kHz) for the fixed 0–16 kHz reference layout. */
export const SPECTROGRAM_FREQUENCY_AXIS_STEP_KHZ = 1;

/** m04 Results / scientific plot: even kHz labels matching the mockup. */
export const SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ = 2;

export const SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ =
  ORCAI_DEFAULT_AXIS_MAX_HZ / 1000;

/** Plain kHz for the spectrogram Y axis (supports 0.5 when zoom densifies). */
export function formatSpectrogramFrequencyAxisKhz(khz: number): string {
  if (!Number.isFinite(khz)) return "—";
  const rounded = Math.round(khz * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

function frequencyLabelStepKhz(
  rangeKhz: number,
  targetLabels: number,
  options?: FrequencyAxisTickOptions,
): number {
  if (rangeKhz <= 0 || targetLabels < 2) return 1;

  const timeSpan = options?.timeViewSpanSec;
  const segment = options?.segmentSpanSec ?? SPECTROGRAM_SEGMENT_SEC;
  const mag =
    timeSpan != null && timeSpan > 0 ? segment / Math.max(timeSpan, 1e-6) : 1;

  // Time-zoom densifies Y labels (YLim fixed); ease label spacing so steps can shrink.
  const baseMinPx = options?.minLabelSpacingPx ?? 30;
  let minPx = baseMinPx;
  if (mag >= 8) minPx = Math.min(baseMinPx, 16);
  else if (mag >= 4) minPx = Math.min(baseMinPx, 22);
  else if (mag >= 2) minPx = Math.min(baseMinPx, 26);

  let step = Math.max(0.1, niceAxisStep(rangeKhz / (targetLabels - 1)));
  if (mag >= 8) step = Math.min(step, 0.5);
  else if (mag >= 4) step = Math.min(step, 1);
  else if (mag >= 2) step = Math.min(step, 2);

  const height = options?.plotHeightPx;
  if (height != null && height > 0) {
    const pxPerKhz = height / rangeKhz;
    while (step * pxPerKhz < minPx && step < rangeKhz) {
      const next = niceAxisStep(step * 2);
      if (next <= step) break;
      step = next;
    }
  }

  return step;
}

/** Y-axis ticks from max kHz (top) down to 0 kHz (bottom). */
export function frequencyAxisTicks(
  axisMaxHz: number = ORCAI_DEFAULT_AXIS_MAX_HZ,
  options?: FrequencyAxisTickOptions,
): FrequencyAxisTick[] {
  const maxHz =
    options?.freqMaxHz ?? (axisMaxHz > 0 ? axisMaxHz : ORCAI_DEFAULT_AXIS_MAX_HZ);
  const minHz = options?.freqMinHz ?? 0;
  const maxKhz = maxHz / 1000;
  const minKhz = minHz / 1000;
  const rangeKhz = Math.max(0.001, maxKhz - minKhz);

  const useFixedStep =
    options?.labelStepKhz != null && options.labelStepKhz > 0;
  const useAuto =
    !useFixedStep &&
    options?.plotHeightPx != null &&
    options.plotHeightPx > 0;
  const step = useFixedStep
    ? options!.labelStepKhz!
    : useAuto
      ? frequencyLabelStepKhz(
          rangeKhz,
          targetAxisLabelCount(
            options.plotHeightPx!,
            options.minLabelSpacingPx ?? 30,
          ),
          options,
        )
      : SPECTROGRAM_FREQUENCY_AXIS_STEP_KHZ;

  const ticks: FrequencyAxisTick[] = [];
  const seen = new Set<number>();

  const pushTick = (khz: number, major: boolean) => {
    let rounded = Math.round(khz * 1000) / 1000;
    if (Math.abs(rounded) < 1e-12) rounded = 0;
    if (rounded < minKhz - 0.001 || rounded > maxKhz + 0.001) return;
    if (seen.has(rounded)) return;
    seen.add(rounded);
    const yFrac =
      rangeKhz > 0 ? 1 - (rounded - minKhz) / rangeKhz : 1;
    ticks.push({
      yFrac: Math.max(0, Math.min(1, yFrac)),
      khz: rounded,
      label: major ? formatSpectrogramFrequencyAxisKhz(rounded) : "",
      major,
    });
  };

  if (useAuto || useFixedStep) {
    const firstIdx = Math.ceil(minKhz / step - 1e-12);
    const lastIdx = Math.floor(maxKhz / step + 1e-12);
    for (let i = firstIdx; i <= lastIdx; i++) {
      pushTick(i * step, true);
    }
    if (!seen.has(0) && minKhz <= 0.001) pushTick(0, true);
    if (!seen.has(Math.round(maxKhz * 1000) / 1000)) pushTick(maxKhz, true);

    // Minor ticks only for auto density; m04 fixed step stays clean (labels only).
    if (useAuto) {
      const minorStep = step / 5;
      if (minorStep >= 0.1) {
        const mFirst = Math.ceil(minKhz / minorStep - 1e-12);
        const mLast = Math.floor(maxKhz / minorStep + 1e-12);
        for (let i = mFirst; i <= mLast; i++) {
          const rounded = Math.round(i * minorStep * 1000) / 1000;
          if (!seen.has(rounded)) pushTick(rounded, false);
        }
      }
    }
  } else {
    for (let khz = maxKhz; khz >= minKhz - 0.001; khz -= step) {
      pushTick(khz, true);
    }
  }

  return ticks.sort((a, b) => a.yFrac - b.yFrac);
}

/** Finer horizontal grid lines between labeled frequency ticks. */
export function frequencyAxisMinorTicks(
  axisMaxHz: number = ORCAI_DEFAULT_AXIS_MAX_HZ,
  options?: FrequencyAxisTickOptions,
): FrequencyAxisTick[] {
  return frequencyAxisTicks(axisMaxHz, options).filter((t) => !t.major);
}
