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

/**
 * Scroll `el` into `scroller`, converting viewport deltas through CSS zoom
 * (`getBoundingClientRect` vs `scrollTop` / `clientHeight`).
 */
export function scrollElementIntoScroller(
  el: HTMLElement,
  scroller: HTMLElement,
  stickyTopViewport = 0,
): void {
  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();
  if (!(scRect.height > 0)) return;
  const zoom =
    scroller.clientHeight > 1 ? scRect.height / scroller.clientHeight : 1;
  const topLimit = scRect.top + stickyTopViewport + 2;
  const bottomLimit = scRect.bottom - 2;
  const fullyOutside = elRect.bottom < topLimit || elRect.top > bottomLimit;
  if (fullyOutside) {
    const rowMid = (elRect.top + elRect.bottom) / 2;
    const viewMid = (topLimit + bottomLimit) / 2;
    scroller.scrollTop += (rowMid - viewMid) / zoom;
    return;
  }
  if (elRect.top < topLimit) {
    scroller.scrollTop -= (topLimit - elRect.top) / zoom;
  } else if (elRect.bottom > bottomLimit) {
    scroller.scrollTop += (elRect.bottom - bottomLimit) / zoom;
  }
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
