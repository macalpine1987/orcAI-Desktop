import {
  spectrogramSegmentCount,
  spectrogramSegmentIndexForStart,
} from "../../lib/spectrogramView";

/** Derived viewport geometry for the file / segment rail. */
export function segmentRailViewport(opts: {
  durationSec: number;
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
}): {
  safeDuration: number;
  segmentTotal: number;
  maxStart: number;
  canScroll: boolean;
  canPrev: boolean;
  canNext: boolean;
  viewportLeftPct: number;
  viewportWidthPct: number;
} {
  const { durationSec, viewStart, viewSpan, segmentIndex } = opts;
  const safeDuration = Math.max(durationSec, 0.01);
  const segmentTotal = spectrogramSegmentCount(safeDuration);
  const maxStart = Math.max(0, durationSec - viewSpan);
  const canScroll = durationSec > 0 && viewSpan < durationSec - 0.01;
  const canPrev = segmentIndex > 0;
  const canNext = segmentIndex < segmentTotal - 1;
  const viewportLeftPct = (viewStart / safeDuration) * 100;
  const viewportWidthPct = (viewSpan / safeDuration) * 100;
  return {
    safeDuration,
    segmentTotal,
    maxStart,
    canScroll,
    canPrev,
    canNext,
    viewportLeftPct,
    viewportWidthPct,
  };
}

/** Map a pointer X on the track to a segment index (studio) or view start. */
export function segmentRailSeekFromClientX(opts: {
  clientX: number;
  trackEl: HTMLDivElement;
  durationSec: number;
  studioLayout: boolean;
}): { kind: "segment"; index: number } | { kind: "viewStart"; start: number } | null {
  const { clientX, trackEl, durationSec, studioLayout } = opts;
  if (durationSec <= 0) return null;
  const rect = trackEl.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (studioLayout) {
    const sec = frac * durationSec;
    return {
      kind: "segment",
      index: spectrogramSegmentIndexForStart(sec, durationSec),
    };
  }
  return { kind: "viewStart", start: frac * durationSec };
}
