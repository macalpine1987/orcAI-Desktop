import type { ProjectRecord } from "../api/projects";

/** How create-recording-table should run after recordings change. */
export type RecordingTableSyncMode = "create" | "merge" | "rebuild";

export function recordingTableSyncOptions(mode: RecordingTableSyncMode): {
  overwrite: boolean;
  update_table: boolean;
} {
  switch (mode) {
    case "create":
      return { overwrite: false, update_table: false };
    case "merge":
      return { overwrite: false, update_table: true };
    case "rebuild":
      return { overwrite: true, update_table: false };
  }
}

export function recordingTableSyncModeAfterAdd(
  project: ProjectRecord,
): RecordingTableSyncMode {
  return project.recording_table_path ? "merge" : "create";
}

export function recordingTableSyncModeAfterDelete(
  project: ProjectRecord,
): RecordingTableSyncMode {
  if (project.wav_count === 0) {
    return project.recording_table_path ? "rebuild" : "create";
  }
  // Merge keeps channel / mask columns; rebuild would wipe them.
  return project.recording_table_path ? "merge" : "create";
}

/** Class names from a parameter document. ``null`` when ``calls`` is absent or not a string list. */
export function parameterCallNames(text: string | null | undefined): string[] | null {
  if (!text?.trim()) return null;
  try {
    const data = JSON.parse(text) as { calls?: unknown };
    if (!Array.isArray(data.calls)) return null;
    if (!data.calls.every((item) => typeof item === "string")) return null;
    return data.calls.map((item) => item.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/** Names present in ``after`` that were not in ``before``. Order of ``after`` is kept. */
export function addedCallNames(before: readonly string[], after: readonly string[]): string[] {
  const known = new Set(before);
  return after.filter((name) => !known.has(name));
}

/** True when a parameter call has no column in ``recording_table.csv``. */
export function callsMissingFromClassColumns(
  calls: readonly string[],
  classColumns: readonly string[],
): boolean {
  const columns = new Set(classColumns);
  return calls.some((call) => {
    const name = call.trim();
    return Boolean(name) && !columns.has(name);
  });
}

/** No WAV left — sidecar removes CSV; skip job unless a stale table path remains. */
export function shouldSyncRecordingTableAfterDelete(
  project: ProjectRecord,
): boolean {
  return project.wav_count > 0 || Boolean(project.recording_table_path);
}
