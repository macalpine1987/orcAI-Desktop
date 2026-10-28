import type { ProjectRecord } from "../api/projects";

/** WAV import/delete is allowed only after orcAI project init (wizard step 3 is pre-init). */
export function canModifyProjectRecordings(project: ProjectRecord | null | undefined): boolean {
  return Boolean(project?.initialized);
}
