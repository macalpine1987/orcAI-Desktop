/**
 * Dense Analysis overlays: hide colliding mean_p labels without changing mark layout.
 * Selected marks always keep their label; others compete per class lane.
 */

export type ProbLabelCandidate = {
  index: number;
  /** Horizontal center of the mark, % of the visible view. */
  centerPct: number;
  /** Visible mark width, % of the view. */
  widthPct: number;
  /** Same-class bands share a lane (labels stack vertically by class). */
  laneKey: string;
  /** Always show (selected row). */
  forceShow?: boolean;
};

/** Min gap between label centers (% of view). ~width of "0.88". */
export const PROB_LABEL_MIN_GAP_PCT = 4.5;

/** Skip labels on hairline marks (tooltip still has mean_p). */
export const PROB_LABEL_MIN_BOX_WIDTH_PCT = 0.75;

/**
 * Greedy left-to-right keep within each lane. Forced labels win first, then
 * optional ones that clear the gap to every already-placed center.
 */
export function selectVisibleProbLabelIndices(
  items: ProbLabelCandidate[],
  minGapPct = PROB_LABEL_MIN_GAP_PCT,
  minBoxWidthPct = PROB_LABEL_MIN_BOX_WIDTH_PCT,
): Set<number> {
  const show = new Set<number>();
  const byLane = new Map<string, ProbLabelCandidate[]>();
  for (const item of items) {
    const list = byLane.get(item.laneKey);
    if (list) list.push(item);
    else byLane.set(item.laneKey, [item]);
  }

  for (const list of byLane.values()) {
    const placedCenters: number[] = [];
    const fits = (center: number) =>
      placedCenters.every((c) => Math.abs(c - center) >= minGapPct);

    for (const item of list) {
      if (!item.forceShow) continue;
      show.add(item.index);
      placedCenters.push(item.centerPct);
    }

    const optional = list
      .filter(
        (item) =>
          !item.forceShow &&
          item.widthPct >= minBoxWidthPct &&
          Number.isFinite(item.centerPct),
      )
      .sort((a, b) => a.centerPct - b.centerPct);

    for (const item of optional) {
      if (!fits(item.centerPct)) continue;
      show.add(item.index);
      placedCenters.push(item.centerPct);
    }
  }

  return show;
}
