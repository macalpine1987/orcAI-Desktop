import { describe, expect, it } from "vitest";
import { estimateRemainingSec, liveElapsedSec } from "./trainMonitorClock";

describe("trainMonitorClock", () => {
  it("estimates remaining from started_at + epoch progress", () => {
    const started = 1_000_000;
    const rem = estimateRemainingSec({
      startedAt: started,
      now: started + 600,
      epoch: 2,
      epochs: 10,
      batch: 50,
      batches: 100,
    });
    // frac = (1 + 0.5) / 10 = 0.15 → rem = 600 * 0.85 / 0.15 = 3400
    expect(rem).toBeCloseTo(3400, 0);
  });

  it("caps remaining by early-stopping horizon", () => {
    const started = 1_000_000;
    // 5 of 30 epochs done, but only 2 patience epochs left → much shorter than full schedule.
    const rem = estimateRemainingSec({
      startedAt: started,
      now: started + 500,
      epoch: 5,
      epochs: 30,
      batch: 0,
      batches: 100,
      earlyStopEpochsLeft: 2,
    });
    // doneUnits=4, remFull = 500*(26/4)=3250; remEs = 500*(1+2)/4 = 375 → 375
    expect(rem).toBeCloseTo(375, 0);
  });

  it("returns null early in epoch 1", () => {
    const started = 1_000_000;
    expect(
      estimateRemainingSec({
        startedAt: started,
        now: started + 30,
        epoch: 1,
        epochs: 30,
        batch: 2,
        batches: 3750,
      }),
    ).toBeNull();
  });

  it("liveElapsedSec tracks wall clock while running", () => {
    const started = 1_000_000;
    expect(
      liveElapsedSec({
        startedAt: started,
        fallbackElapsed: 10,
        running: true,
        now: started + 42,
      }),
    ).toBe(42);
    expect(
      liveElapsedSec({
        startedAt: started,
        fallbackElapsed: 99,
        running: false,
        now: started + 42,
      }),
    ).toBe(99);
  });
});
