import { describe, expect, it } from "vitest";
import {
  clampTimeRange,
  normalizeTimeRange,
  timeRangeBandInView,
} from "./spectrogramTimeRange";

describe("spectrogramTimeRange", () => {
  it("normalizes reversed ranges", () => {
    expect(normalizeTimeRange(5, 2)).toEqual({ t0: 2, t1: 5 });
  });

  it("clamps to duration and enforces min span", () => {
    expect(clampTimeRange(1, 2, 120)).toEqual({ t0: 1, t1: 2 });
    expect(clampTimeRange(1, 1.02, 120)).toBeNull();
  });

  it("computes visible band fractions", () => {
    const band = timeRangeBandInView({ t0: 5, t1: 15 }, 0, 30);
    expect(band).toEqual({ leftPct: (5 / 30) * 100, widthPct: (10 / 30) * 100 });
  });
});
