import { describe, expect, it } from "vitest";
import {
  resolveLargeWavOptimize,
  resolveShowSpectrogram,
} from "../preferences/storage";

describe("resolveShowSpectrogram", () => {
  it("defaults to true when unset", () => {
    expect(resolveShowSpectrogram({})).toBe(true);
  });

  it("honors explicit false", () => {
    expect(resolveShowSpectrogram({ showSpectrogram: false })).toBe(false);
  });

  it("honors explicit true", () => {
    expect(resolveShowSpectrogram({ showSpectrogram: true })).toBe(true);
  });
});

describe("resolveLargeWavOptimize", () => {
  it("defaults to false when unset", () => {
    expect(resolveLargeWavOptimize({})).toBe(false);
  });

  it("honors true when spectrogram is on", () => {
    expect(
      resolveLargeWavOptimize({
        showSpectrogram: true,
        largeWavOptimize: true,
      }),
    ).toBe(true);
  });

  it("forces false when spectrogram is off even if optimize was stored true", () => {
    expect(
      resolveLargeWavOptimize({
        showSpectrogram: false,
        largeWavOptimize: true,
      }),
    ).toBe(false);
  });
});
