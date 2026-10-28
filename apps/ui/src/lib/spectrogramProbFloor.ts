/**
 * Results · Classes rail probability floor (0–100).
 * 0 = show every detection; otherwise keep mean_p strictly above the floor.
 */

export function confidenceFractionToFloorPercent(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

export function floorPercentToConfidenceFraction(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.max(0, Math.min(1, percent / 100));
}

/** orcAI mean_p is 0..1; some rows may already be 0..100. */
export function meanPToPercent(meanP: number): number {
  return meanP <= 1 ? meanP * 100 : meanP;
}

export function segmentPassesProbabilityFloor(
  meanP: number | null | undefined,
  floorPercent: number,
): boolean {
  const floor = Number.isFinite(floorPercent) ? floorPercent : 0;
  if (floor <= 0) return true;
  // Annotations / compare layers have no mean_p — keep them visible.
  if (meanP == null || !Number.isFinite(meanP)) return true;
  return meanPToPercent(meanP) > floor;
}
