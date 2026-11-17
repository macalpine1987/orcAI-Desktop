import { describe, expect, it } from "vitest";
import type { ResultsSummaryResponse } from "../api/results";
import {
  RESULTS_SUMMARY_TTL_MS,
  resultsSnapshotIsFresh,
  type ResultsSnapshotEntry,
} from "./resultsSummaryCache";

function stubRes(): ResultsSummaryResponse {
  return {
    source: "predicted",
    scan_dir: "/p",
    files_total: 0,
    files_ok: 0,
    files_failed: 0,
    truncated: false,
    summary: {
      detection_count: 0,
      recording_count: 0,
      duration_sec: 0,
      mean_p: null,
      models: [],
      thresholds: [],
    },
    classes: [],
    recordings: [],
    rows: [],
  };
}

describe("resultsSnapshotIsFresh", () => {
  it("is false for missing entry", () => {
    expect(resultsSnapshotIsFresh(undefined)).toBe(false);
  });

  it("is true within TTL and false after", () => {
    const entry: ResultsSnapshotEntry = {
      res: stubRes(),
      fetchedAt: 1_000,
    };
    expect(resultsSnapshotIsFresh(entry, 1_000 + RESULTS_SUMMARY_TTL_MS - 1)).toBe(
      true,
    );
    expect(resultsSnapshotIsFresh(entry, 1_000 + RESULTS_SUMMARY_TTL_MS)).toBe(
      false,
    );
  });
});
