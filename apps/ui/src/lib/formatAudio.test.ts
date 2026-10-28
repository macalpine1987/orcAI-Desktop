import { describe, expect, it } from "vitest";
import {
  displayOrcaiViewSampleRateHz,
  displaySpectrogramSampleRateHz,
  formatBitDepth,
  formatBytes,
  formatSampleRateHz,
} from "./formatAudio";

describe("formatAudio", () => {
  it("formats kHz sample rates", () => {
    expect(formatSampleRateHz(384_000)).toBe("384 kHz");
    expect(formatSampleRateHz(48_000)).toBe("48 kHz");
    expect(formatSampleRateHz(44_100)).toBe("44.1 kHz");
  });

  it("floors orcAI view rate to 48 kHz for Results chrome", () => {
    expect(displayOrcaiViewSampleRateHz(41_100)).toBe(48_000);
    expect(displayOrcaiViewSampleRateHz(44_100)).toBe(48_000);
    expect(displayOrcaiViewSampleRateHz(48_000)).toBe(48_000);
    expect(displayOrcaiViewSampleRateHz(192_000)).toBe(192_000);
    expect(displayOrcaiViewSampleRateHz(null)).toBe(null);
  });

  it("prefers effective (resampled) rate for spectrogram chrome", () => {
    expect(
      displaySpectrogramSampleRateHz({
        sample_rate: 44_100,
        effective_sample_rate: 48_000,
      }),
    ).toBe(48_000);
    expect(
      displaySpectrogramSampleRateHz({
        sample_rate: 41_100,
      }),
    ).toBe(48_000);
  });

  it("formats bit depth", () => {
    expect(formatBitDepth(24)).toBe("24 bit");
    expect(formatBitDepth(32)).toBe("32 bit");
    expect(formatBitDepth(null)).toBe("—");
  });

  it("formats file sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(172 * 1024 * 1024)).toBe("172 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });
});
