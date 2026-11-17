export type TimeRangeSec = { t0: number; t1: number };

export const MIN_TIME_RANGE_SEC = 0.08;

/**
 * Whether a document pointerdown should clear LMB time selection / loop.
 * Play/pause/seek/zoom/volume live under spectrogram chrome and must not wipe the loop.
 */
export function pointerClearsTimeSelection(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-spectrogram-plot]")) return false;
  if (target.closest("[data-preserve-time-selection]")) return false;
  if (target.closest("[data-spectrogram-chrome]")) return false;
  if (target.closest("[data-spectrogram-zoom]")) return false;
  if (target.closest('[role="dialog"]')) return false;
  if (target.closest(".predict-app-modal-overlay")) return false;
  return true;
}

export function normalizeTimeRange(t0: number, t1: number): TimeRangeSec {
  return t0 <= t1 ? { t0, t1 } : { t0: t1, t1: t0 };
}

/** Clamp to file duration; returns null if span is too short. */
export function clampTimeRange(
  t0: number,
  t1: number,
  durationSec: number,
  minSpanSec = MIN_TIME_RANGE_SEC,
): TimeRangeSec | null {
  const { t0: a0, t1: a1 } = normalizeTimeRange(t0, t1);
  const t0c = Math.max(0, a0);
  const t1c = Math.min(durationSec, a1);
  if (t1c - t0c < minSpanSec) return null;
  return { t0: t0c, t1: t1c };
}

/** Horizontal band within the visible spectrogram window (percent). */
export function timeRangeBandInView(
  range: TimeRangeSec,
  viewStart: number,
  viewSpan: number,
): { leftPct: number; widthPct: number } | null {
  if (viewSpan <= 0) return null;
  const viewEnd = viewStart + viewSpan;
  const visT0 = Math.max(range.t0, viewStart);
  const visT1 = Math.min(range.t1, viewEnd);
  if (visT1 <= visT0) return null;
  return {
    leftPct: ((visT0 - viewStart) / viewSpan) * 100,
    widthPct: ((visT1 - visT0) / viewSpan) * 100,
  };
}
