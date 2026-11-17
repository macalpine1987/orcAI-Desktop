import type { TFunction } from "i18next";
import type {
  ProjectFocus,
  ProjectNextAction,
  ProjectReadinessState,
  ProjectSummary,
} from "../api/projects";

export type ReadinessItemKey =
  | "recordings"
  | "annotations"
  | "predict"
  | "datasets"
  | "model";

export const READINESS_ITEMS: ReadinessItemKey[] = [
  "recordings",
  "annotations",
  "predict",
  "datasets",
  "model",
];

export function readinessFocusLabel(focus: ProjectFocus, t: TFunction): string {
  return t(`home.readinessFocus.${focus}`);
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Files on disk. Table rows are not WAV files. */
function homeWavCount(summary: ProjectSummary): number {
  return nonNegative(summary.readiness_lines.recordings.wav_count);
}

export function readinessLineDetail(
  summary: ProjectSummary,
  key: ReadinessItemKey,
  t: TFunction,
): string {
  const lines = summary.readiness_lines;
  const wav = homeWavCount(summary);
  switch (key) {
    case "recordings":
      return t("home.readinessDetail.recordingsWav", { count: wav });
    case "annotations": {
      const line = lines.annotations;
      if (typeof line.paired_files === "number") {
        const total = wav > 0 ? wav : nonNegative(line.total);
        return t("home.readinessDetail.annotations", {
          annotated: nonNegative(line.paired_files),
          total,
        });
      }
      return t("home.readinessDetail.annotations", {
        annotated: nonNegative(line.annotated),
        total: nonNegative(line.total),
      });
    }
    case "predict":
      return t("home.readinessDetail.predict", {
        predicted: nonNegative(lines.predict.predicted),
        total: wav > 0 ? wav : nonNegative(lines.predict.total),
      });
    case "datasets":
      if (lines.datasets.file_count > 0) {
        return t("home.readinessDetail.datasetsReady", {
          count: lines.datasets.file_count,
        });
      }
      return lines.datasets.has_tvt_dir
        ? t("home.readinessDetail.datasetsEmpty")
        : t("home.readinessDetail.datasetsMissing");
    case "model":
      if (lines.model.model_name) {
        return lines.model.model_name;
      }
      if (lines.model.checkpoint_count > 0) {
        return t("home.readinessDetail.modelCheckpoints", {
          count: lines.model.checkpoint_count,
        });
      }
      return t("home.readinessDetail.modelMissing");
    default:
      return "";
  }
}

export function formatNextActionsHint(
  actions: ProjectNextAction[],
  t: TFunction,
): string | null {
  if (actions.length === 0) return null;
  const labels = actions.map((action) => t(`home.nextAction.${action}`));
  return t("home.readinessNextSteps", { steps: labels.join(" · ") });
}

export function readinessDotClass(state: ProjectReadinessState | undefined): string {
  if (state === "ready") return "is-ready";
  if (state === "needed") return "is-needed";
  return "is-empty";
}
