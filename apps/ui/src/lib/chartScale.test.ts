import { describe, expect, it } from "vitest";
import { chartYDomain, formatTick, niceDomain, niceStep } from "./chartScale";

describe("chartScale", () => {
  it("niceStep picks 1/2/5×10^n", () => {
    expect(niceStep(0.12)).toBeCloseTo(0.1, 10);
    expect(niceStep(0.35)).toBeCloseTo(0.5, 10);
    expect(niceStep(3.2)).toBeCloseTo(5, 10);
  });

  it("niceDomain produces round ticks covering the span", () => {
    const d = niceDomain(0.45, 0.71, 5);
    expect(d.min).toBeLessThanOrEqual(0.45);
    expect(d.max).toBeGreaterThanOrEqual(0.71);
    for (const t of d.ticks) {
      expect(Number.isFinite(t)).toBe(true);
    }
    const labels = d.ticks.map(formatTick);
    expect(labels.every((s) => /^\d+(\.\d{1,2})?$/.test(s))).toBe(true);
  });

  it("MBA-like series zooms to data inside [0, 1] with round ticks", () => {
    const d = chartYDomain([0.5539, 0.6227, 0.7, 0.81]);
    expect(d.min).toBeGreaterThanOrEqual(0);
    expect(d.max).toBeLessThanOrEqual(1);
    // Must not force full 0–1 (that flattens early epochs).
    expect(d.min).toBeGreaterThan(0.05);
    expect(d.max).toBeLessThan(0.95);
    expect(d.min).toBeLessThanOrEqual(0.55);
    expect(d.max).toBeGreaterThanOrEqual(0.81);
    expect(d.ticks.length).toBeGreaterThanOrEqual(4);
    // Tick labels map inside domain.
    expect(d.ticks[0]).toBe(d.min);
    expect(d.ticks[d.ticks.length - 1]).toBe(d.max);
  });

  it("empty MBA chart keeps mockup-like 0.3–0.9 frame", () => {
    const d = chartYDomain([]);
    expect(d.min).toBeCloseTo(0.3, 5);
    expect(d.max).toBeCloseTo(0.9, 5);
  });
});
