import { describe, expect, it } from "vitest";
import { effectiveLabelDeltaT, segmentTimeSec } from "./segmentTime";

describe("segmentTimeSec", () => {
  it("uses float seconds from orcAI predicted.txt (no int truncation)", () => {
    expect(
      segmentTimeSec(
        { start: 0.8533, stop: 1.024, time_unit: "seconds" },
        0.05,
        132.8,
        "seconds",
      ),
    ).toEqual({ t0: 0.8533, t1: 1.024 });
  });

  it("uses frame indices when time_unit is frames", () => {
    expect(
      segmentTimeSec(
        { start: 100, stop: 200, start_sec: 5, stop_sec: 10, time_unit: "frames" },
        0.05,
        132.8,
        "frames",
      ),
    ).toEqual({ t0: 5, t1: 10 });
  });

  it("infers seconds from fractional start/stop", () => {
    expect(
      segmentTimeSec({ start: 2.56, stop: 3.6693 }, null, 120),
    ).toEqual({ t0: 2.56, t1: 3.6693 });
  });
});

describe("effectiveLabelDeltaT", () => {
  it("returns 1 for seconds unit", () => {
    expect(
      effectiveLabelDeltaT(0.05, [{ stop: 10 }], 100, "seconds"),
    ).toBe(1);
  });
});
