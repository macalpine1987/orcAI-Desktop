import { describe, expect, it } from "vitest";
import {
  confidenceFractionToFloorPercent,
  floorPercentToConfidenceFraction,
  segmentPassesProbabilityFloor,
} from "./spectrogramProbFloor";

describe("segmentPassesProbabilityFloor", () => {
  it("shows every value at floor 0, including missing mean_p", () => {
    expect(segmentPassesProbabilityFloor(null, 0)).toBe(true);
    expect(segmentPassesProbabilityFloor(0.01, 0)).toBe(true);
    expect(segmentPassesProbabilityFloor(1, 0)).toBe(true);
  });

  it("keeps only values strictly above the floor", () => {
    expect(segmentPassesProbabilityFloor(0.9, 90)).toBe(false);
    expect(segmentPassesProbabilityFloor(0.91, 90)).toBe(true);
    expect(segmentPassesProbabilityFloor(0.89, 90)).toBe(false);
  });

  it("keeps missing mean_p when a floor is set (annotations / compare)", () => {
    expect(segmentPassesProbabilityFloor(null, 90)).toBe(true);
  });
});

describe("confidenceFractionToFloorPercent", () => {
  it("round-trips the studio 0–100 slider", () => {
    expect(confidenceFractionToFloorPercent(0)).toBe(0);
    expect(confidenceFractionToFloorPercent(0.9)).toBe(90);
    expect(floorPercentToConfidenceFraction(90)).toBe(0.9);
  });
});
