import type { JobRecord } from "../api/jobs";
import { revealInFileManager } from "../platform/shell";

function firstArtifact(job: JobRecord): string | null {
  if (Array.isArray(job.artifacts) && job.artifacts.length > 0) {
    return job.artifacts[0]!;
  }
  const result = job.result;
  if (result && typeof result === "object") {
    for (const key of [
      "output_path",
      "predicted_path",
      "label_path",
      "path",
      "file",
    ]) {
      const v = result[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  const output = job.params.output_path;
  if (typeof output === "string" && output !== "default" && output.length > 0) {
    return output;
  }
  return null;
}

export function jobResultPath(job: JobRecord): string | null {
  if (job.status !== "completed") return null;
  return firstArtifact(job);
}

/** Reveal completed job artifact in Finder / Explorer. */
export async function revealJobResult(job: JobRecord): Promise<boolean> {
  const path = jobResultPath(job);
  if (!path) return false;
  return revealInFileManager(path);
}
