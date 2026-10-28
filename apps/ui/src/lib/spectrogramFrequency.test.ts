import { describe, expect, it } from "vitest";
import {
  frequencyAtCursor,
  hzFromMel,
  melFromHz,
  shouldUseTfOverlayBox,
  tfBoxLayoutFromHz,
  yFracFromHz,
} from "./spectrogramFrequency";

describe("spectrogramFrequency", () => {
  it("round-trips mel scale", () => {
    const hz = 8201;
    const mel = melFromHz(hz);
    expect(hzFromMel(mel)).toBeCloseTo(hz, 0);
  });

  it("linear mode is exact Hz", () => {
    const r = frequencyAtCursor("linear", 0, 24000);
    expect(r.isApproximate).toBe(false);
    expect(r.hz).toBe(24000);
  });

  it("log_mel mode is approximate", () => {
    const r = frequencyAtCursor("log_mel", 0.5, 24000);
    expect(r.isApproximate).toBe(true);
    expect(r.hz).toBeGreaterThan(0);
  });

  it("maps Hz band to vertical box (linear)", () => {
    const top = yFracFromHz("linear", 12000, 24000);
    const bottom = yFracFromHz("linear", 4000, 24000);
    expect(top).toBeLessThan(bottom);
    const box = tfBoxLayoutFromHz("linear", 4000, 12000, 24000);
    expect(box.heightPct).toBeGreaterThan(0);
    expect(box.topPct).toBeCloseTo(top * 100, 0);
  });

  it("rejects near-full-axis TF spans (vertical strip guard)", () => {
    expect(shouldUseTfOverlayBox(500, 3500, 16_000)).toBe(true);
    expect(shouldUseTfOverlayBox(0, 15_000, 16_000)).toBe(false);
    expect(shouldUseTfOverlayBox(100, 200, 0)).toBe(false);
  });
});
