import { describe, expect, it } from "vitest";
import {
  clampMarkOpacity,
  scaleMarkOpacity,
  SPECTROGRAM_MARK_OPACITY_DEFAULT,
} from "./spectrogramMarkOpacity";

describe("spectrogramMarkOpacity", () => {
  it("defaults to 50", () => {
    expect(SPECTROGRAM_MARK_OPACITY_DEFAULT).toBe(50);
    expect(clampMarkOpacity(Number.NaN)).toBe(50);
  });

  it("scales opacity with 50 as unity", () => {
    expect(scaleMarkOpacity(0.48, 50)).toBeCloseTo(0.48, 6);
    expect(scaleMarkOpacity(0.48, 0)).toBe(0);
    expect(scaleMarkOpacity(0.48, 100)).toBeCloseTo(0.96, 6);
  });

  it("caps at 1", () => {
    expect(scaleMarkOpacity(0.92, 100)).toBe(1);
  });
});
