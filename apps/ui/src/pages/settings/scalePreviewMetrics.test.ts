import { describe, expect, it } from "vitest";
import {
  computeScalePreviewMetrics,
  SCALE_PREVIEW_DOCK_COLLAPSED_PX,
  SCALE_PREVIEW_DOCK_EXPANDED_PX,
} from "./scalePreviewMetrics";

describe("computeScalePreviewMetrics", () => {
  it("computes effective viewport at 125%", () => {
    const m = computeScalePreviewMetrics("125", "collapsed");
    expect(m.pct).toBe(125);
    expect(m.effectiveWidth).toBe(1024);
    expect(m.effectiveHeight).toBe(640);
    expect(m.dockHeightPx).toBe(SCALE_PREVIEW_DOCK_COLLAPSED_PX);
  });

  it("computes expanded dock height at 125%", () => {
    const m = computeScalePreviewMetrics("125", "expanded");
    expect(m.effectiveWidth).toBe(1024);
    expect(m.effectiveHeight).toBe(640);
    expect(m.dockHeightPx).toBe(SCALE_PREVIEW_DOCK_EXPANDED_PX);
  });
});
