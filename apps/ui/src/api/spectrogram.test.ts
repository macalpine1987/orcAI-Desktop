import { describe, expect, it, vi } from "vitest";
import {
  spectrogramTileUrl,
  spectrogramWaveformUrl,
} from "./spectrogram";

vi.mock("./sidecar", () => ({
  getSidecarBase: () => "http://127.0.0.1:9999",
}));

describe("spectrogram API URLs", () => {
  it("includes display and colormap params on tile URL", () => {
    const url = spectrogramTileUrl({
      path: "/tmp/a.wav",
      t0: 0,
      t1: 10,
      width: 800,
      height: 256,
      colormap: "viridis",
      _epoch: 3,
    });
    expect(url).toContain("display_kind=orcai");
    expect(url).toContain("colormap=viridis");
    expect(url).toContain("v=3-orcai-viridis");
    expect(url).toContain("_=3");
  });

  it("waveform URL omits display params", () => {
    const url = spectrogramWaveformUrl({
      path: "/tmp/a.wav",
      t0: 1,
      t1: 2,
      width: 400,
      height: 48,
    });
    expect(url).not.toContain("display_kind");
    expect(url).toContain("t0=1");
  });
});
