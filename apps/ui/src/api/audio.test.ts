import { describe, expect, it } from "vitest";
import { audioPlaybackUrl, audioSegmentUrl } from "./audio";

describe("audio API URLs", () => {
  it("builds playback URL with encoded path", () => {
    const url = audioPlaybackUrl("/tmp/a b.wav", 2);
    expect(url).toContain("/v1/audio/playback");
    expect(url).toContain("channel=2");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("path")).toBe("/tmp/a b.wav");
  });

  it("builds segment URL with times", () => {
    const url = audioSegmentUrl("/tmp/x.wav", 1, 1.5, 3.25);
    expect(url).toContain("t0=1.5");
    expect(url).toContain("t1=3.25");
  });
});
