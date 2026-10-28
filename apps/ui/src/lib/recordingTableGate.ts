import type { RecordingTableSyncStatus } from "../api/projects";

/**
 * True when Predict must wait for CSV to be current.
 * Auto-sync does not bypass the gate — it only means Desktop will sync for you (BUG-02).
 */
export function isRecordingTableBlockingPredict(args: {
  syncStatus: RecordingTableSyncStatus | null | undefined;
  wavCount: number;
  autoSync?: boolean;
}): boolean {
  if (args.wavCount <= 0) return false;
  const sync = args.syncStatus ?? "missing";
  return sync === "stale" || sync === "missing";
}

/** Soft-orange attention on «Обновить таблицу» when manual mode + stale CSV. */
export function shouldHighlightRefreshTable(args: {
  syncStatus: RecordingTableSyncStatus | null | undefined;
  wavCount: number;
  autoSync: boolean;
  /** Parameter ``calls`` gained a name the CSV does not have yet. Does not block Predict. */
  callsColumnsMissing?: boolean;
}): boolean {
  if (args.autoSync) return false;
  if (args.callsColumnsMissing) return true;
  return isRecordingTableBlockingPredict(args);
}
