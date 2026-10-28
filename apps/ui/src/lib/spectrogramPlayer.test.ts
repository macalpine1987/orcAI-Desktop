import { describe, expect, it } from "vitest";
import {
  clampPlayhead,
  formatPlayerClock,
  formatStudioLcdClock,
  playheadForFileEnd,
  resolvePlayheadSeek,
  skipPlayhead,
  splitPlayerClock,
  viewStartForPlayhead,
} from "./spectrogramPlayer";

describe("spectrogramPlayer", () => {
  it("clamps playhead to duration", () => {
    expect(clampPlayhead(-1, 60)).toBe(0);
    expect(clampPlayhead(100, 60)).toBe(60);
  });

  it("skips by delta", () => {
    expect(skipPlayhead(10, -5, 60)).toBe(5);
    expect(skipPlayhead(58, 5, 60)).toBe(60);
  });

  it("formats player clock", () => {
    expect(formatPlayerClock(14.2)).toBe("00:14.2");
    expect(formatPlayerClock(3661)).toBe("1:01:01.0");
  });

  it("formats m04 studio LCD clock without tenths", () => {
    expect(formatStudioLcdClock(287)).toBe("04:47");
    expect(formatStudioLcdClock(1392)).toBe("23:12");
    expect(formatStudioLcdClock(3661)).toBe("1:01:01");
  });

  it("splits player clock into LCD fields", () => {
    expect(splitPlayerClock(14.2)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 14,
      tenths: 2,
    });
    expect(splitPlayerClock(3661)).toEqual({
      hours: 1,
      minutes: 1,
      seconds: 1,
      tenths: 0,
    });
  });

  it("resolves seek to file end for audio element", () => {
    expect(playheadForFileEnd(120)).toBeCloseTo(119.999, 3);
    expect(resolvePlayheadSeek(120, 120)).toEqual({
      playhead: playheadForFileEnd(120),
      atStart: false,
      atEnd: true,
    });
    expect(resolvePlayheadSeek(119.9995, 120).atEnd).toBe(true);
  });

  it("pans view to file end when seeking to end", () => {
    expect(
      viewStartForPlayhead(119.999, 0, 30, 120, false, true),
    ).toBe(90);
    expect(
      viewStartForPlayhead(119.999, 10, 30, 120, false, true),
    ).toBe(90);
  });

  it("pans view to file start when seeking to start", () => {
    expect(viewStartForPlayhead(0, 50, 30, 120, true, false)).toBe(0);
  });
});
