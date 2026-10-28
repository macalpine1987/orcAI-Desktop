import { describe, expect, it } from "vitest";
import {
  ORCAI_DEFAULT_AXIS_MAX_HZ,
  spectrogramAxisMaxHz,
} from "./spectrogramAxis";
import type { SpectrogramMeta } from "../api/spectrogram";

describe("spectrogramAxisMaxHz", () => {
  it("uses meta.axis_max_hz when present", () => {
    const meta: SpectrogramMeta = {
      path: "/a.wav",
      duration_sec: 10,
      sample_rate: 44_100,
      channels: 1,
      axis_max_hz: 8_000,
    };
    expect(spectrogramAxisMaxHz(meta)).toBe(8_000);
  });

  it("defaults to 16 kHz", () => {
    expect(spectrogramAxisMaxHz()).toBe(ORCAI_DEFAULT_AXIS_MAX_HZ);
    expect(spectrogramAxisMaxHz()).toBe(16_000);
  });
});
