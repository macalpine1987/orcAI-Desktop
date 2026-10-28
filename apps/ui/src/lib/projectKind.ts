import type { ProjectKind } from "../api/projects";

/**
 * Legacy manifest `project_kind` (recognition | training).
 *
 * FR-2.14, FR-2.17: the kind is derived from the soft focus and is
 * informational only — it never hides navigation. Recognition focus makes
 * the Training section inactive (`pipelineNavInactive`).
 */
export function normalizeProjectKind(
  raw: string | null | undefined,
): ProjectKind {
  return raw === "training" ? "training" : "recognition";
}
