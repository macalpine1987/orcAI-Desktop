import { describe, expect, it } from "vitest";
import {
  formatSpectrogramAxisTime,
  scientificTimeAxisMajorStepSec,
  scientificTimeAxisMinorStepSec,
  timeAxisLabelDecimals,
  timeAxisMarks,
  timeAxisTicks,
} from "./spectrogramTimeTicks";

describe("timeAxisTicks", () => {
  it("formats times as MM:SS", () => {
    expect(formatSpectrogramAxisTime(72)).toBe("01:12");
    expect(formatSpectrogramAxisTime(14)).toBe("00:14");
  });

  it("formats fractional seconds when decimals are set", () => {
    expect(formatSpectrogramAxisTime(14.5, 1)).toBe("00:14.5");
    expect(formatSpectrogramAxisTime(0.25, 2)).toBe("00:00.25");
  });

  it("returns ticks within the view window", () => {
    const ticks = timeAxisTicks(10, 30, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const tick of ticks) {
      expect(tick.xFrac).toBeGreaterThanOrEqual(0);
      expect(tick.xFrac).toBeLessThanOrEqual(1);
    }
  });
});

describe("timeAxisMarks", () => {
  it("uses finer mark step than label step for a 200 s window", () => {
    const labeled = timeAxisTicks(0, 200);
    const marks = timeAxisMarks(0, 200);
    expect(marks.length).toBeGreaterThan(labeled.length);
    expect(marks.some((m) => m.label != null)).toBe(true);
    expect(marks.some((m) => m.label == null)).toBe(true);
  });

  it("adapts tick density when plot width is provided", () => {
    const wide = timeAxisTicks(0, 60, { plotWidthPx: 900 });
    const narrow = timeAxisTicks(0, 60, { plotWidthPx: 320 });
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length);
  });

  it("keeps marks inside the view", () => {
    const marks = timeAxisMarks(10, 30);
    for (const mark of marks) {
      expect(mark.xFrac).toBeGreaterThanOrEqual(0);
      expect(mark.xFrac).toBeLessThanOrEqual(1);
    }
  });

  it("aligns labeled marks with major tick positions", () => {
    for (const [viewStart, viewEnd] of [
      [0, 200],
      [200, 400],
      [215, 415],
      [10, 30],
    ] as const) {
      const labeled = timeAxisTicks(viewStart, viewEnd);
      const marks = timeAxisMarks(viewStart, viewEnd).filter((m) => m.label);
      for (const mark of marks) {
        const tick = labeled.find((t) => t.label === mark.label);
        expect(tick, `${viewStart}-${viewEnd} ${mark.label}`).toBeDefined();
        expect(mark.xFrac).toBeCloseTo(tick!.xFrac, 6);
      }
    }
  });

  it("maps time linearly across the window", () => {
    const marks = timeAxisMarks(200, 400);
    const span = 200;
    for (const mark of marks) {
      expect(mark.xFrac).toBeCloseTo((mark.tSec - 200) / span, 6);
    }
  });
});

describe("scientific grid (MATLAB-like XLim ticks)", () => {
  const sci = { scientificGrid: true, plotWidthPx: 720 };

  it("uses nice major/minor steps on a 200 s window", () => {
    expect(scientificTimeAxisMajorStepSec(200, 720)).toBe(50);
    expect(scientificTimeAxisMinorStepSec(200, 720)).toBe(10);
    const marks = timeAxisMarks(0, 200, sci);
    expect(marks.length).toBeGreaterThan(10);
    expect(marks.some((m) => m.label == null)).toBe(true);
    const labeled = marks.filter((m) => m.label).map((m) => m.tSec);
    expect(labeled).toContain(0);
    expect(labeled).toContain(50);
    expect(labeled).toContain(100);
  });

  it("densifies ticks when zoomed to a short window", () => {
    expect(scientificTimeAxisMajorStepSec(5, 720)).toBeLessThanOrEqual(1);
    expect(scientificTimeAxisMinorStepSec(5, 720)).toBeLessThan(1);
    expect(timeAxisLabelDecimals(0.2)).toBe(1);

    const marks = timeAxisMarks(10, 15, sci);
    const labeled = marks.filter((m) => m.label);
    expect(labeled.length).toBeGreaterThanOrEqual(3);
    expect(marks.length).toBeGreaterThan(labeled.length);
    // Absolute-time binding: marks stay on physical seconds inside XLim.
    for (const mark of marks) {
      expect(mark.tSec).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(mark.tSec).toBeLessThanOrEqual(15 + 1e-6);
      expect(mark.xFrac).toBeCloseTo((mark.tSec - 10) / 5, 6);
    }
  });

  it("shows fractional labels under deep zoom", () => {
    const ticks = timeAxisTicks(0, 2, sci);
    expect(ticks.some((t) => t.label.includes("."))).toBe(true);
  });

  it("always labels the visible window edges so zoom updates axis values", () => {
    const marks = timeAxisMarks(247, 307, sci); // 04:07 — 05:07
    const labeled = marks.filter((m) => m.label);
    expect(labeled[0]?.tSec).toBeCloseTo(247, 5);
    expect(labeled[0]?.xFrac).toBe(0);
    expect(labeled[labeled.length - 1]?.tSec).toBeCloseTo(307, 5);
    expect(labeled[labeled.length - 1]?.xFrac).toBe(1);
    expect(labeled[0]?.label).toMatch(/04:07/);
    expect(labeled[labeled.length - 1]?.label).toMatch(/05:07/);
  });

  it("labels densify vs a wide window (MATLAB Axes)", () => {
    const wide = timeAxisMarks(0, 200, sci);
    const tight = timeAxisMarks(0, 20, sci);
    const wideStep = scientificTimeAxisMajorStepSec(200, 720);
    const tightStep = scientificTimeAxisMajorStepSec(20, 720);
    expect(tightStep).toBeLessThan(wideStep);
    expect(tight.filter((m) => m.label).length).toBeGreaterThanOrEqual(
      wide.filter((m) => m.label).length - 2,
    );
  });
});
