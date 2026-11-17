import type { ProjectRecord } from "../api/projects";
import { inferPredictedLabelPath } from "../lib/predictLabels";
import {
  isFilteredLabelPath,
  type PredictQueue,
  type PredictQueueFile,
} from "./predictQueueTypes";

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

export function buildPredictQueueFromTable(
  project: ProjectRecord,
  tablePath: string,
): PredictQueue {
  const name = basename(tablePath);
  return {
    projectId: project.id,
    projectDir: project.path,
    projectName: project.display_name,
    files: [
      {
        name,
        path: tablePath,
        kind: "csv_table",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
      },
    ],
    activeFileName: name,
    selectedNames: [name],
    batchSelectionExplicit: false,
  };
}

export function resolveFilterPredictedPath(
  file: PredictQueueFile,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string | null {
  if (file.kind === "csv_table") {
    const direct = file.labelPath?.trim();
    if (direct && !isFilteredLabelPath(direct)) return direct;
    return null;
  }
  const stored = file.labelPath?.trim();
  if (stored && !isFilteredLabelPath(stored)) return stored;
  if (file.status === "done" || file.status === "filtered") {
    return inferPredictedLabelPath(file.path, channel, modelId, modelLabelName);
  }
  return null;
}

