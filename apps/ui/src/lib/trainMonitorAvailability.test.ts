import { describe, expect, it } from "vitest";
import {
  isTrainMonitorEntryEnabled,
  isTrainMonitorLive,
} from "./trainMonitorAvailability";

const steps = (
  statuses: Array<{ id: string; status: string }>,
) => statuses;

describe("isTrainMonitorEntryEnabled", () => {
  it("stays off while earlier plan steps are busy even if train is queued", () => {
    expect(
      isTrainMonitorEntryEnabled({
        phase: "queued",
        steps: steps([
          { id: "create-label-arrays", status: "running" },
          { id: "create-snippet-table", status: "queued" },
          { id: "train", status: "queued" },
        ]),
      }),
    ).toBe(false);
  });

  it("enables when train is next in queue (earlier steps finished)", () => {
    expect(
      isTrainMonitorEntryEnabled({
        phase: "queued",
        steps: steps([
          { id: "create-label-arrays", status: "done" },
          { id: "create-tvt-data", status: "done" },
          { id: "train", status: "queued" },
        ]),
      }),
    ).toBe(true);
  });

  it("enables while train is running", () => {
    expect(
      isTrainMonitorEntryEnabled({
        phase: "running",
        steps: steps([{ id: "train", status: "running" }]),
      }),
    ).toBe(true);
  });

  it("keeps entry after a finished / failed / cancelled snapshot", () => {
    for (const phase of ["done", "error", "cancelled"] as const) {
      expect(
        isTrainMonitorEntryEnabled({
          phase,
          steps: steps([{ id: "train", status: "idle" }]),
        }),
      ).toBe(true);
    }
  });

  it("stays off when idle with no train activity", () => {
    expect(
      isTrainMonitorEntryEnabled({
        phase: "idle",
        steps: steps([
          { id: "create-label-arrays", status: "done" },
          { id: "train", status: "idle" },
        ]),
      }),
    ).toBe(false);
    expect(
      isTrainMonitorEntryEnabled({ phase: null, steps: null }),
    ).toBe(false);
  });

  it("enables from board train done/error without a live phase", () => {
    expect(
      isTrainMonitorEntryEnabled({
        phase: "idle",
        steps: steps([{ id: "train", status: "done" }]),
      }),
    ).toBe(true);
    expect(
      isTrainMonitorEntryEnabled({
        phase: "idle",
        steps: steps([{ id: "train", status: "error" }]),
      }),
    ).toBe(true);
  });
});

describe("isTrainMonitorLive", () => {
  it("is lit only while train is running", () => {
    expect(
      isTrainMonitorLive({
        phase: "running",
        steps: steps([{ id: "train", status: "running" }]),
      }),
    ).toBe(true);
    expect(
      isTrainMonitorLive({
        phase: "queued",
        steps: steps([{ id: "train", status: "queued" }]),
      }),
    ).toBe(false);
    expect(
      isTrainMonitorLive({
        phase: "done",
        steps: steps([{ id: "train", status: "done" }]),
      }),
    ).toBe(false);
    expect(
      isTrainMonitorLive({
        phase: "cancelled",
        steps: steps([{ id: "train", status: "idle" }]),
      }),
    ).toBe(false);
  });
});
