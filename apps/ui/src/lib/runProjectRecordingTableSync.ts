import { startProjectSyncTableJob } from "../api/projects";
import type { JobRecord } from "../api/jobs";
import {
  recordingTableSyncOptions,
  type RecordingTableSyncMode,
} from "./recordingTableSync";
import { waitForJobTerminal } from "./waitForJob";

export async function runProjectRecordingTableSync(
  projectId: string,
  mode: RecordingTableSyncMode,
  options?: {
    onJobCreated?: (job: JobRecord) => void;
    t?: (key: string, options?: Record<string, unknown>) => string;
  },
): Promise<JobRecord> {
  const job = await startProjectSyncTableJob(
    projectId,
    recordingTableSyncOptions(mode),
  );
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
