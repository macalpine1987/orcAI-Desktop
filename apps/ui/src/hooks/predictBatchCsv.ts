import type { JobRecord } from "../api/jobs";
import {
  matchPredictBatchResultToQueueFile,
  predictFileNeedsOverwrite,
  type PredictBatchFileResult,
} from "../lib/predictBatch";
import {
  patchPredictQueueFile,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";
import { saveWorkspace } from "../workspace/storage";

export type ApplyBatchFileResultsArgs = {
  pending: PredictQueueFile[];
  results: PredictBatchFileResult[];
  jobStatus: JobRecord["status"];
  currentQueue: PredictQueue | null;
  failedLabel: string;
};

export type ApplyBatchFileResultsOut = {
  next: PredictQueue | null;
  succeeded: number;
  failed: number;
  preexisting: number;
};

/** Apply CSV-batch job result rows onto the predict queue. */
export function applyCsvBatchFileResults(
  args: ApplyBatchFileResultsArgs,
): ApplyBatchFileResultsOut {
  const { pending, results, jobStatus, currentQueue, failedLabel } = args;
  let next = currentQueue;
  let succeeded = 0;
  let failed = 0;
  let preexisting = 0;

  for (const file of pending) {
    const row = matchPredictBatchResultToQueueFile(file, results);
    if (jobStatus === "cancelled" && (!row || row.status !== "completed")) {
      next = patchPredictQueueFile(
        file.name,
        {
          status: predictFileNeedsOverwrite(file) ? "done" : "pending",
          error: undefined,
        },
        next,
      );
      continue;
    }
    if (row?.status === "completed" && row.label_path) {
      succeeded += 1;
      next = patchPredictQueueFile(
        file.name,
        {
          status: "done",
          labelPath: row.label_path,
          filteredPath: undefined,
          error: undefined,
        },
        next,
      );
      if (currentQueue?.activeFileName === file.name) {
        saveWorkspace({
          lastLabelPath: row.label_path,
          lastWavPath: row.wav_path || file.path,
        });
      }
    } else if (row?.status === "preexisting" && row.label_path) {
      preexisting += 1;
      next = patchPredictQueueFile(
        file.name,
        {
          status: "done",
          labelPath: row.label_path,
          error: undefined,
        },
        next,
      );
    } else {
      failed += 1;
      next = patchPredictQueueFile(
        file.name,
        {
          status: "failed",
          error: failedLabel,
        },
        next,
      );
    }
  }

  return { next, succeeded, failed, preexisting };
}
