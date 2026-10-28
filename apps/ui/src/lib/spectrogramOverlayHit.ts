import { labelBandLayout } from "./labelBandLayout";

export type OverlayHitItem<T> = {
  seg: T;
  label: string;
  t0: number;
  t1: number;
};

/**
 * Pick the overlay mark under a click. In a short/narrow plot, class lanes and
 * same-class intervals overlap — DOM stacking is not the class the user aimed at.
 */
export function hitOverlaySegment<T>(
  items: OverlayHitItem<T>[],
  args: {
    xFrac: number;
    yPx: number;
    heightPx: number;
    viewStart: number;
    viewSpan: number;
    labelNames: string[];
    minWidthFrac?: number;
  },
): T | null {
  const {
    xFrac,
    yPx,
    heightPx,
    viewStart,
    viewSpan,
    labelNames,
    minWidthFrac = 0.002,
  } = args;
  if (!(viewSpan > 0) || !(heightPx > 0) || items.length === 0) return null;

  const time = viewStart + xFrac * viewSpan;
  const minDur = viewSpan * minWidthFrac;
  let best: { item: OverlayHitItem<T>; rank: OverlayHitRank } | null = null;

  for (const item of items) {
    const vis0 = Math.max(item.t0, viewStart);
    const vis1 = Math.min(item.t1, viewStart + viewSpan);
    if (!(vis1 > vis0)) continue;
    const pad = Math.max(0, (minDur - (vis1 - vis0)) / 2);
    if (time < vis0 - pad || time > vis1 + pad) continue;

    const { y, bandHeight } = labelBandLayout(item.label, labelNames, heightPx);
    const y0 = y;
    const y1 = y + bandHeight;
    const inBand = yPx >= y0 && yPx <= y1;
    const distY = inBand ? 0 : yPx < y0 ? y0 - yPx : yPx - y1;
    const duration = Math.max(minDur, item.t1 - item.t0);
    const distT = Math.abs((item.t0 + item.t1) / 2 - time);
    const rank: OverlayHitRank = { inBand, distY, duration, distT };
    if (!best || overlayHitRankBetter(rank, best.rank)) {
      best = { item, rank };
    }
  }

  return best?.item.seg ?? null;
}

type OverlayHitRank = {
  inBand: boolean;
  distY: number;
  duration: number;
  distT: number;
};

function overlayHitRankBetter(a: OverlayHitRank, b: OverlayHitRank): boolean {
  if (a.inBand !== b.inBand) return a.inBand;
  if (a.distY !== b.distY) return a.distY < b.distY;
  if (a.duration !== b.duration) return a.duration < b.duration;
  return a.distT < b.distT;
}
