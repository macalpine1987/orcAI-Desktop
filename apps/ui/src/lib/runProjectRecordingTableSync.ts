import {
  startProjectSyncTableJob,
  type ProjectSyncTableOptions,
} from "../api/projects";
import type { JobRecord } from "../api/jobs";
import {
  recordingTableSyncOptions,
  type RecordingTableSyncMode,
} from "./recordingTableSync";
import { waitForJobTerminal } from "./waitForJob";

export type RecordingTableSyncExtras = Pick<
  ProjectSyncTableOptions,
  "default_channel" | "remove_duplicate_filenames" | "exclude_patterns"
>;

export async function runProjectRecordingTableSync(
  projectId: string,
  mode: RecordingTableSyncMode,
  options?: {
    onJobCreated?: (job: JobRecord) => void;
    t?: (key: string, options?: Record<string, unknown>) => string;
    extras?: RecordingTableSyncExtras;
  },
): Promise<JobRecord> {
  const extras = options?.extras ?? {};
  const job = await startProjectSyncTableJob(projectId, {
    ...recordingTableSyncOptions(mode),
    ...(typeof extras.default_channel === "number"
      ? { default_channel: extras.default_channel }
      : {}),
    ...(extras.remove_duplicate_filenames
      ? { remove_duplicate_filenames: true }
      : {}),
    ...(extras.exclude_patterns?.trim()
      ? { exclude_patterns: extras.exclude_patterns.trim() }
      : {}),
  });
  options?.onJobCreated?.(job);
  const finished = await waitForJobTerminal(job.id);
  if (finished.status !== "completed") {
    throw new Error(
      finished.error ??
        (finished.status === "cancelled"
          ? (options?.t?.("predict.tableSyncCancelled") ?? "Table sync cancelled")
          : (options?.t?.("predict.tableSyncFailed") ?? "Table sync failed")),
    );
  }
  return finished;
}
