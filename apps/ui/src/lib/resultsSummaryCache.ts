import type { ResultsSummaryResponse } from "../api/results";

/** Soft TTL: skip network when revisiting Results within this window. */
export const RESULTS_SUMMARY_TTL_MS = 60_000;

export type ResultsSnapshotEntry = {
  res: ResultsSummaryResponse;
  fetchedAt: number;
};

export function resultsSnapshotIsFresh(
  entry: ResultsSnapshotEntry | undefined,
  now = Date.now(),
  ttlMs = RESULTS_SUMMARY_TTL_MS,
): boolean {
  return entry != null && now - entry.fetchedAt < ttlMs;
}
