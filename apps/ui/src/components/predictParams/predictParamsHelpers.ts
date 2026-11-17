import { predictRecordingStem } from "../../lib/predictBatch";
import type { PredictQueueFileStatus } from "../../workspace/predictQueue";

export function channelForQueueFile(
  fileName: string,
  channelMap: Record<string, number>,
  fallback: number,
): number {
  return (
    channelMap[fileName] ??
    channelMap[predictRecordingStem(fileName)] ??
    fallback
  );
}

/** Known builtin class lists for m03 class strip (orcAI parameter.json). */
export const BUILTIN_MODEL_CLASSES: Record<string, string[]> = {
  "orcai-isl-v1": [
    "BR",
    "BUZZ",
    "HERDING",
    "PHS",
    "SS",
    "TAILSLAP",
    "WHISTLE",
  ],
  "orcai-nor-v1": [
    "BR",
    "BUZZ",
    "HERDING",
    "PHS",
    "SS",
    "TAILSLAP",
    "WHISTLE",
  ],
};

export function statusTone(status: PredictQueueFileStatus): string {
  switch (status) {
    case "done":
    case "filtered":
      return "pp-status--done";
    case "failed":
      return "pp-status--failed";
    case "running":
      return "pp-status--running";
    default:
      return "pp-status--pending";
  }
}

export function statusKey(status: PredictQueueFileStatus): string {
  switch (status) {
    case "done":
      return "predict.run.statusDone";
    case "filtered":
      return "predict.run.statusFiltered";
    case "failed":
      return "predict.run.statusFailed";
    case "running":
      return "predict.run.statusRunning";
    default:
      return "predict.run.statusPending";
  }
}
