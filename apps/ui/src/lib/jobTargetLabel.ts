import type { JobRecord } from "../api/jobs";

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Human-readable job target for the «Объект» column (m16). */
export function jobTargetLabel(job: JobRecord): string {
  const p = job.params;
  const recording =
    typeof p.recording_path === "string" ? p.recording_path : null;
  if (recording) {
    if (recording.toLowerCase().endsWith(".csv")) {
      return basename(recording);
    }
    return basename(recording);
  }
  const projectDir =
    typeof p.project_dir === "string" ? p.project_dir : null;
  if (projectDir) return basename(projectDir);
  const modelDir = typeof p.model_dir === "string" ? p.model_dir : null;
  if (modelDir) return basename(modelDir);
  const output =
    typeof p.output_path === "string" && p.output_path !== "default"
      ? p.output_path
      : null;
  if (output) return basename(output);
  if (Array.isArray(job.artifacts) && job.artifacts.length > 0) {
    return basename(job.artifacts[0]!);
  }
  return "—";
}
