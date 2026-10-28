import {
  SPECTROGRAM_SEGMENT_SEC,
  spectrogramSegmentCount,
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
} from "./spectrogramView";

export function shouldResetViewForDetection(
  t0: number,
  t1: number,
  viewStart: number,
  viewEnd: number,
  segmentIndex: number,
  durationSec: number,
  epsilon = 0.25,
): boolean {
  const targetSeg = spectrogramSegmentIndexForStart(t0, durationSec);
  if (targetSeg !== segmentIndex) return true;
  if (t0 < viewStart - epsilon || t1 > viewEnd + epsilon) return true;
  return false;
}

/**
 * View window after focusing a detection from the table / overlay.
 * Resets to the detection's file-segment when needed; never pans with a
 * stale pre-reset view (that used to leave the last signals off-screen).
 */
export function viewWindowForFocusedDetection(
  t0: number,
  t1: number,
  viewStart: number,
  viewSpan: number,
  segmentIndex: number,
  durationSec: number,
): { segmentIndex: number; viewStart: number; viewSpan: number; reset: boolean } {
  const reset = shouldResetViewForDetection(
    t0,
    t1,
    viewStart,
    viewStart + viewSpan,
    segmentIndex,
    durationSec,
  );
  if (reset) {
    const w = spectrogramSegmentWindow(
      spectrogramSegmentIndexForStart(t0, durationSec),
      durationSec,
    );
    return {
      segmentIndex: w.segmentIndex,
      viewStart: w.viewStart,
      viewSpan: w.viewSpan,
      reset: true,
    };
  }
  return { segmentIndex, viewStart, viewSpan, reset: false };
}

/** Tolerance for pan/zoom reset vs default segment window (seconds). */
export const VIEW_SEGMENT_EPSILON_SEC = 0.05;

export function viewDiffersFromSegment(
  viewStart: number,
  viewSpan: number,
  segmentIndex: number,
  durationSec: number,
  epsilon = VIEW_SEGMENT_EPSILON_SEC,
): boolean {
  const seg = spectrogramSegmentWindow(segmentIndex, durationSec);
  return (
    Math.abs(viewStart - seg.viewStart) > epsilon ||
    Math.abs(viewSpan - seg.viewSpan) > epsilon
  );
}

export function segmentBoundaryLabel(
  segmentIndex: number,
  durationSec: number,
): { t0: number; t1: number } {
  const seg = spectrogramSegmentWindow(segmentIndex, durationSec);
  return {
    t0: Math.round(seg.viewStart),
    t1: Math.round(seg.viewStart + seg.viewSpan),
  };
}

export function snapMinimapToSegment(
  proposedStart: number,
  durationSec: number,
): number {
  const idx = spectrogramSegmentIndexForStart(proposedStart, durationSec);
  return spectrogramSegmentWindow(idx, durationSec).viewStart;
}

export type SpectrogramPanResult =
  | { kind: "view"; viewStart: number; segmentIndex: number }
  | { kind: "segment"; segmentIndex: number };

/**
 * Pan inside the current 200 s segment. Further scroll while already at the
 * right/left edge advances to the next/previous segment (zoom resets via applySegment).
 */
export function resolveSpectrogramPan(params: {
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
  durationSec: number;
  deltaSec: number;
  edgeEpsilon?: number;
}): SpectrogramPanResult {
  const {
    viewStart,
    viewSpan,
    segmentIndex,
    durationSec,
    deltaSec,
    edgeEpsilon = 1e-3,
  } = params;
  if (!(Math.abs(deltaSec) > 0)) {
    return { kind: "view", viewStart, segmentIndex };
  }

  const total = spectrogramSegmentCount(durationSec);
  const seg = spectrogramSegmentWindow(segmentIndex, durationSec);
  const minStart = seg.viewStart;
  const maxStart = Math.max(minStart, seg.viewStart + seg.viewSpan - viewSpan);
  const atRightEdge = viewStart >= maxStart - edgeEpsilon;
  const atLeftEdge = viewStart <= minStart + edgeEpsilon;

  if (deltaSec > 0 && atRightEdge && segmentIndex < total - 1) {
    return { kind: "segment", segmentIndex: segmentIndex + 1 };
  }
  if (deltaSec < 0 && atLeftEdge && segmentIndex > 0) {
    return { kind: "segment", segmentIndex: segmentIndex - 1 };
  }

  const next = Math.max(minStart, Math.min(viewStart + deltaSec, maxStart));
  return { kind: "view", viewStart: next, segmentIndex };
}

/**
 * Free-hand pan across the whole file (any segment). Keeps the current
 * viewSpan; updates segmentIndex from the new window start.
 */
export function resolveSpectrogramPanFree(params: {
  viewStart: number;
  viewSpan: number;
  durationSec: number;
  deltaSec: number;
}): { viewStart: number; segmentIndex: number } {
  const { viewStart, viewSpan, durationSec, deltaSec } = params;
  const maxStart = Math.max(0, durationSec - viewSpan);
  const next = Math.max(0, Math.min(viewStart + deltaSec, maxStart));
  return {
    viewStart: next,
    segmentIndex: spectrogramSegmentIndexForStart(next, durationSec),
  };
}

/**
 * Keep `centerSec` in the middle of the new view window (clamped to file bounds).
 * Used when zooming while a detection is selected.
 */
export function viewStartCenteredOnTime(
  centerSec: number,
  viewSpan: number,
  durationSec: number,
): number {
  if (viewSpan <= 0) return 0;
  const maxStart = Math.max(0, durationSec - viewSpan);
  return Math.max(0, Math.min(centerSec - viewSpan / 2, maxStart));
}

export { SPECTROGRAM_SEGMENT_SEC };
