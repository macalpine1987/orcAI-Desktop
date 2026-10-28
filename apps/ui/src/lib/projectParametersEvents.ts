/** Fired after orcai_parameter.json is written so pipeline readiness can refresh. */

export const PROJECT_PARAMETERS_SAVED_EVENT = "orcai-parameters-saved";

export type ProjectParametersSavedDetail = {
  projectId: string;
};

export function notifyProjectParametersSaved(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return;
  window.dispatchEvent(
    new CustomEvent<ProjectParametersSavedDetail>(PROJECT_PARAMETERS_SAVED_EVENT, {
      detail: { projectId },
    }),
  );
}
