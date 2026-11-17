import type { PipelineReadinessLamp } from "../api/projects";

export type RecordingTableSync = "missing" | "stale" | "current";

/** i18n key for the training-board recording-table subtitle. */
export function pipelineTableDetailKey(
  sync: RecordingTableSync | null | undefined,
  state: PipelineReadinessLamp,
): string {
  if (sync === "stale") return "pipeline.ready.tableStale";
  if (sync === "missing") return "pipeline.ready.tableMissing";
  if (state === "ok") return "pipeline.ready.tableSub";
  return "pipeline.ready.tableEmpty";
}
