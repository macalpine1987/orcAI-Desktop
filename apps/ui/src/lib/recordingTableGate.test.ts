import { describe, expect, it } from "vitest";
import {
  isRecordingTableBlockingPredict,
  shouldHighlightRefreshTable,
} from "./recordingTableGate";

describe("recordingTableGate", () => {
  it("still blocks when auto-sync is on but CSV is stale/missing", () => {
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "stale",
        wavCount: 3,
        autoSync: true,
      }),
    ).toBe(true);
    expect(
      shouldHighlightRefreshTable({
        syncStatus: "stale",
        wavCount: 3,
        autoSync: true,
      }),
    ).toBe(false);
  });

  it("does not block when there are no WAVs", () => {
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "missing",
        wavCount: 0,
        autoSync: false,
      }),
    ).toBe(false);
  });

  it("blocks when manual + stale/missing with WAVs", () => {
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "stale",
        wavCount: 2,
        autoSync: false,
      }),
    ).toBe(true);
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "missing",
        wavCount: 1,
        autoSync: false,
      }),
    ).toBe(true);
    expect(
      shouldHighlightRefreshTable({
        syncStatus: "stale",
        wavCount: 1,
        autoSync: false,
      }),
    ).toBe(true);
  });

  it("highlights refresh when calls lack CSV columns without blocking predict", () => {
    expect(
      shouldHighlightRefreshTable({
        syncStatus: "current",
        wavCount: 2,
        autoSync: false,
        callsColumnsMissing: true,
      }),
    ).toBe(true);
    expect(
      shouldHighlightRefreshTable({
        syncStatus: "current",
        wavCount: 2,
        autoSync: true,
        callsColumnsMissing: true,
      }),
    ).toBe(false);
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "current",
        wavCount: 2,
        autoSync: false,
      }),
    ).toBe(false);
  });

  it("allows predict when table is current", () => {
    expect(
      isRecordingTableBlockingPredict({
        syncStatus: "current",
        wavCount: 5,
        autoSync: false,
      }),
    ).toBe(false);
  });
});
