/** Shared TrainWizard helpers (move-only extract). */
import { isAbortError } from "../lib/fetchErrors";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import { WIZARD_STEP_IDS, type WizardStepId } from "./types";

export function stepIndex(id: WizardStepId): number {
  return WIZARD_STEP_IDS.indexOf(id);
}

export function emptyAnnotationsFallback(
  projectId: string,
): import("../api/projects").ProjectAnnotations {
  return {
    project_id: projectId,
    classes: [],
    classes_source: "annotations",
    has_mask_columns: false,
    rows: [],
    class_stats: [],
    unlisted_labels: [],
    annotated_count: 0,
    total_count: 0,
  };
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** User-facing wizard banner text; null on abort. */
export function wizardErrorMessage(
  err: unknown,
  t: Translate,
  fallback?: string,
): string | null {
  if (isAbortError(err)) return null;
  if (fallback && !(err instanceof Error && err.message.trim())) {
    return fallback;
  }
  return formatUserFacingErrorRequired(err, t);
}

export type TrainWizardCloseResult = {
  planId?: string;
  firstJobId?: string;
  jobCount?: number;
  includesHpsearch?: boolean;
  commands?: string[];
};
