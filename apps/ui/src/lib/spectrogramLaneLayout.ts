import type { SpectrogramDisplayKind } from "./spectrogramView";
import { yFracFromHz } from "./spectrogramFrequency";

const MIN_LANE_BAR_PX = 3;

export type LaneBarLayout = {
  yOffset: number;
  height: number;
};

export function laneBarLayout(
  hzMin: number | undefined,
  hzMax: number | undefined,
  laneInnerHeight: number,
  displayKind: SpectrogramDisplayKind,
  nyquistHz: number,
): LaneBarLayout {
  const inner = Math.max(MIN_LANE_BAR_PX + 2, laneInnerHeight);
  if (
    hzMin != null &&
    hzMax != null &&
    hzMax > hzMin &&
    nyquistHz > 0
  ) {
    const yTop = yFracFromHz(displayKind, hzMax, nyquistHz);
    const yBottom = yFracFromHz(displayKind, hzMin, nyquistHz);
    const yOffset = yTop * inner;
    const height = Math.max(MIN_LANE_BAR_PX, (yBottom - yTop) * inner);
    return { yOffset, height };
  }
  return { yOffset: 0, height: inner };
}
