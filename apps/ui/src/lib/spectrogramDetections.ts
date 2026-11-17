import type { LabelTimeUnit } from "../api/labels";
import type { LabelLayerSource } from "./labelColors";
import { segmentTimeSec } from "./segmentTime";
import {
  confidenceFractionToFloorPercent,
  segmentPassesProbabilityFloor,
} from "./spectrogramProbFloor";

export type DetectionSegmentInput = {
  start: number;
  stop: number;
  label: string;
  mean_p: number | null;
  source: LabelLayerSource;
  time_unit?: LabelTimeUnit;
  start_sec?: number;
  stop_sec?: number;
  hz_min?: number | null;
  hz_max?: number | null;
};

export type DetectionRow = {
  id: string;
  t0: number;
  t1: number;
  durationSec: number;
  label: string;
  confidence: number | null;
  hzMin: number | null;
  hzMax: number | null;
  fileName: string;
};

/** Selected detection on spectrogram / table (label disambiguates equal intervals). */
export type DetectionSelection = {
  t0: number;
  t1: number;
  label?: string;
};

export function detectionRowsForTable(
  segments: DetectionSegmentInput[],
  options: {
    deltaT: number | null | undefined;
    durationSec: number;
    timeUnit?: LabelTimeUnit;
    confidenceMin: number;
    primaryOnly?: boolean;
    fileName?: string;
    hiddenLabels?: Set<string>;
  },
): DetectionRow[] {
  const {
    deltaT,
    durationSec,
    timeUnit,
    confidenceMin,
    primaryOnly = true,
    fileName = "",
    hiddenLabels,
  } = options;

  let pool = segments;
  if (primaryOnly) {
    const primary = segments.filter((s) => s.source === "primary");
    pool = primary.length > 0 ? primary : segments;
  }

  return pool
    .filter((seg) =>
      segmentPassesProbabilityFloor(
        seg.mean_p,
        confidenceFractionToFloorPercent(confidenceMin),
      ),
    )
    .filter((seg) => !hiddenLabels?.has(seg.label))
    .map((seg, index) => {
      const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
      const hzMin =
        typeof seg.hz_min === "number" && Number.isFinite(seg.hz_min)
          ? seg.hz_min
          : null;
      const hzMax =
        typeof seg.hz_max === "number" && Number.isFinite(seg.hz_max)
          ? seg.hz_max
          : null;
      return {
        id: `${seg.source}-${seg.label}-${seg.start}-${index}`,
        t0,
        t1,
        durationSec: Math.max(0, t1 - t0),
        label: seg.label,
        confidence: seg.mean_p,
        hzMin,
        hzMax,
        fileName,
      };
    })
    .sort((a, b) => a.t0 - b.t0 || a.label.localeCompare(b.label));
}

export function detectionRowMatchesSelection(
  row: DetectionRow,
  selected: DetectionSelection | null,
  epsilon = 0.05,
): boolean {
  return detectionIntervalMatchesSelection(
    row.t0,
    row.t1,
    selected,
    epsilon,
    row.label,
  );
}

/**
 * Resolve the table row for a spectrogram selection.
 * Prefers exact interval match; falls back to same label + nearest start
 * (overlay / table can differ slightly after segment window jumps).
 */
export function findDetectionRowForSelection(
  rows: DetectionRow[],
  selected: DetectionSelection | null,
  epsilon = 0.12,
): DetectionRow | null {
  if (!selected || rows.length === 0) return null;
  const tight = nearestMatchingRow(rows, selected, 1e-3);
  if (tight) return tight;
  const close = nearestMatchingRow(rows, selected, epsilon);
  if (close) return close;

  const wantLabel = selected.label != null && selected.label !== "";
  let best: DetectionRow | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    if (wantLabel && row.label !== selected.label) continue;
    const overlaps =
      row.t1 > selected.t0 - epsilon && row.t0 < selected.t1 + epsilon;
    if (!overlaps) continue;
    const dist = Math.abs(row.t0 - selected.t0) + Math.abs(row.t1 - selected.t1);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

function nearestMatchingRow(
  rows: DetectionRow[],
  selected: DetectionSelection,
  limit: number,
): DetectionRow | null {
  let best: DetectionRow | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    if (!detectionRowMatchesSelection(row, selected, limit)) continue;
    const dist = Math.abs(row.t0 - selected.t0) + Math.abs(row.t1 - selected.t1);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

/** Sum of `offsetTop` from `el` up to `scroller`. Null when the chain stops short. */
export function offsetTopWithinScroller(
  el: HTMLElement,
  scroller: HTMLElement,
): number | null {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== scroller) {
    top += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    if (!(parent instanceof HTMLElement)) return null;
    node = parent;
  }
  return node === scroller ? top : null;
}

/**
 * Scroll `el` into `scroller` using CSS pixels (`offsetTop` / `scrollTop`).
 * `stickyTop` is the sticky header height in those same pixels.
 * Returns false when the sizes are zero or `el` is outside `scroller`.
 *
 * When ``scroller`` is ``position: static`` it is not an ``offsetParent``, so the
 * offsetTop chain misses it — fall back to getBoundingClientRect deltas
 * (Home plan rail, other flex lists).
 */
export function scrollElementIntoScroller(
  el: HTMLElement,
  scroller: HTMLElement,
  stickyTop = 0,
): boolean {
  if (!(scroller.clientHeight > 0) || !(el.offsetHeight > 0)) return false;
  const top = offsetTopWithinScroller(el, scroller);
  if (top != null) {
    const rowBottom = top + el.offsetHeight;
    const viewTop = scroller.scrollTop + stickyTop;
    const viewBottom = scroller.scrollTop + scroller.clientHeight;
    const fullyInside = top >= viewTop + 2 && rowBottom <= viewBottom - 2;
    if (fullyInside) return true;
    const visible = scroller.clientHeight - stickyTop;
    const centered = top - stickyTop - (visible - el.offsetHeight) / 2;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.max(0, Math.min(centered, maxScroll));
    return true;
  }
  if (!scroller.contains(el)) return false;
  const row = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (!(row.height > 0) || !(box.height > 0)) return false;
  const viewTop = box.top + stickyTop;
  const viewBottom = box.bottom;
  const fullyInside = row.top >= viewTop + 2 && row.bottom <= viewBottom - 2;
  if (fullyInside) return true;
  const visible = scroller.clientHeight - stickyTop;
  const delta = row.top - viewTop - (visible - row.height) / 2;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + delta, maxScroll));
  return true;
}

function scrollsVertically(node: HTMLElement): boolean {
  if (!(node.clientHeight > 0) || node.scrollHeight <= node.clientHeight + 1) {
    return false;
  }
  const overflow = getComputedStyle(node).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

/** Move `scroller` just enough that `el` sits inside its visible box. */
function scrollRectIntoView(el: HTMLElement, scroller: HTMLElement): void {
  const row = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (!(row.height > 0) || !(box.height > 0)) return;
  const pad = 8;
  let delta = 0;
  if (row.height >= box.height - pad * 2) {
    delta = row.top - box.top - pad;
  } else if (row.top < box.top + pad) {
    delta = row.top - box.top - pad;
  } else if (row.bottom > box.bottom - pad) {
    delta = row.bottom - box.bottom + pad;
  }
  if (delta === 0) return;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + delta, maxScroll));
}

/**
 * Put the selected detection row into the table's own scroller, then into
 * every vertical ancestor (the analysis studio). A row already inside the
 * table can still sit below the studio fold.
 */
export function revealElementInScrollers(
  el: HTMLElement,
  nearest: HTMLElement | null,
  stickyTop = 0,
): boolean {
  if (!(el.offsetHeight > 0) && el.getClientRects().length === 0) return false;
  if (nearest) scrollElementIntoScroller(el, nearest, stickyTop);
  let node = (nearest ?? el).parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (scrollsVertically(node)) scrollRectIntoView(el, node);
    node = node.parentElement;
  }
  return true;
}

/** Rows whose time interval overlaps `[rangeStart, rangeEnd)`. */
export function detectionRowsInRange(
  rows: DetectionRow[],
  rangeStart: number,
  rangeEnd: number,
): DetectionRow[] {
  if (!(rangeEnd > rangeStart)) return [];
  return rows.filter((row) => row.t1 > rangeStart && row.t0 < rangeEnd);
}

/**
 * First row (DOM / list order) whose vertical span intersects the table body
 * viewport — used to sync spectrogram focus while scrolling the detections list.
 */
export function leadDetectionIdInViewport(
  rows: ReadonlyArray<{ id: string; top: number; bottom: number }>,
  bodyTop: number,
  bodyBottom: number,
  epsilon = 2,
): string | null {
  if (!(bodyBottom > bodyTop)) return null;
  for (const row of rows) {
    if (row.bottom > bodyTop + epsilon && row.top < bodyBottom - epsilon) {
      return row.id;
    }
  }
  return null;
}

export type DetectionTypeCount = {
  label: string;
  count: number;
};

/** Aggregate detection counts by label (stable legend order when sorter given). */
export function detectionTypeCounts(
  rows: DetectionRow[],
  sortLabels: (labels: string[]) => string[] = (labels) =>
    [...labels].sort((a, b) => a.localeCompare(b)),
): DetectionTypeCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  }
  return sortLabels([...counts.keys()]).map((label) => ({
    label,
    count: counts.get(label) ?? 0,
  }));
}

export function detectionIntervalMatchesSelection(
  t0: number,
  t1: number,
  selected: DetectionSelection | null,
  epsilon = 0.05,
  label?: string,
): boolean {
  if (!selected) return false;
  const timeOk =
    Math.abs(t0 - selected.t0) < epsilon &&
    Math.abs(t1 - selected.t1) < epsilon;
  if (!timeOk) return false;
  if (selected.label == null || selected.label === "") return true;
  if (label == null) return false;
  return selected.label === label;
}

/** True when selection overlaps the file-segment window [start, end). */
export function detectionSelectionInRange(
  selected: DetectionSelection | null,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  if (!selected || !(rangeEnd > rangeStart)) return false;
  return selected.t1 > rangeStart && selected.t0 < rangeEnd;
}
