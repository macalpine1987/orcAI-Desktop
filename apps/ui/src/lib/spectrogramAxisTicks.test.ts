import { describe, expect, it } from "vitest";
import {
  formatSpectrogramFrequencyAxisKhz,
  frequencyAxisTicks,
  SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ,
} from "./spectrogramAxisTicks";

describe("frequencyAxisTicks", () => {
  it("uses integer 0–16 kHz scale (top = 16, bottom = 0)", () => {
    const ticks = frequencyAxisTicks();
    expect(ticks).toHaveLength(SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ + 1);
    expect(ticks[0]).toMatchObject({ label: "16", khz: 16, yFrac: 0 });
    expect(ticks[8]).toMatchObject({ label: "8", khz: 8, yFrac: 0.5 });
    expect(ticks[16]).toMatchObject({ label: "0", khz: 0, yFrac: 1 });
  });

  it("formats axis kHz as plain integers or one decimal", () => {
    expect(formatSpectrogramFrequencyAxisKhz(8)).toBe("8");
    expect(formatSpectrogramFrequencyAxisKhz(16)).toBe("16");
    expect(formatSpectrogramFrequencyAxisKhz(0.5)).toBe("0.5");
  });

  it("m04 scientific step labels 16…2 without densifying", () => {
    const ticks = frequencyAxisTicks(16_000, { labelStepKhz: 2 });
    const labeled = ticks.filter((t) => t.label);
    expect(labeled.map((t) => t.khz)).toEqual([16, 14, 12, 10, 8, 6, 4, 2, 0]);
    expect(labeled[0]).toMatchObject({ khz: 16, yFrac: 0 });
    expect(labeled.find((t) => t.khz === 8)?.yFrac).toBe(0.5);
    expect(labeled.find((t) => t.khz === 2)?.yFrac).toBeCloseTo(1 - 2 / 16, 5);
  });

  it("auto-ticks reduce label density for short plot height", () => {
    const ticks = frequencyAxisTicks(16_000, { plotHeightPx: 280 });
    const labeled = ticks.filter((t) => t.label);
    expect(labeled.length).toBeLessThan(SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ + 1);
    expect(labeled.length).toBeGreaterThanOrEqual(4);
    expect(labeled[0]?.khz).toBeGreaterThanOrEqual(12);
    expect(labeled.at(-1)?.khz).toBe(0);
  });

  it("densifies kHz labels when time-zoomed (YLim stays 0–16)", () => {
    const wide = frequencyAxisTicks(16_000, {
      plotHeightPx: 280,
      timeViewSpanSec: 200,
    });
    const tight = frequencyAxisTicks(16_000, {
      plotHeightPx: 280,
      timeViewSpanSec: 20,
    });
    const wideMajors = wide.filter((t) => t.major);
    const tightMajors = tight.filter((t) => t.major);
    expect(tightMajors.length).toBeGreaterThan(wideMajors.length);
    for (const tick of tight) {
      expect(tick.khz).toBeGreaterThanOrEqual(0);
      expect(tick.khz).toBeLessThanOrEqual(16);
    }
  });
});
