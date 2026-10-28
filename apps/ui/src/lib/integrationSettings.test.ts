import { describe, expect, it } from "vitest";
import {
  liveLogVerbosity,
  resolveLogVerbosity,
  setLiveLogVerbosity,
  shouldWarmFullSpectrogram,
  LARGE_WAV_FULL_STFT_MAX_SEC,
  withJobVerbosity,
} from "./integrationSettings";

describe("integration settings", () => {
  it("resolves verbosity 0–3 and defaults to 2", () => {
    expect(resolveLogVerbosity(0)).toBe(0);
    expect(resolveLogVerbosity("3")).toBe(3);
    expect(resolveLogVerbosity(9)).toBe(2);
    expect(resolveLogVerbosity(undefined)).toBe(2);
  });

  it("injects live -v only when the job omits verbosity", () => {
    setLiveLogVerbosity(3);
    expect(liveLogVerbosity()).toBe(3);
    expect(withJobVerbosity({ project_dir: "/p" })).toEqual({
      project_dir: "/p",
      verbosity: 3,
    });
    expect(withJobVerbosity({ verbosity: 0 })).toEqual({ verbosity: 0 });
    setLiveLogVerbosity(2);
  });

  it("keeps full-file spectrogram warm unless the long-WAV toggle is on", () => {
    expect(shouldWarmFullSpectrogram(3 * 3600, false)).toBe(true);
    expect(shouldWarmFullSpectrogram(30, false)).toBe(true);
    expect(shouldWarmFullSpectrogram(LARGE_WAV_FULL_STFT_MAX_SEC, true)).toBe(
      true,
    );
    expect(
      shouldWarmFullSpectrogram(LARGE_WAV_FULL_STFT_MAX_SEC + 1, true),
    ).toBe(false);
  });
});
