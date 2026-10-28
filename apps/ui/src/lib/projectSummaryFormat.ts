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

export function readinessLineDetail(
  summary: ProjectSummary,
  key: ReadinessItemKey,
  t: TFunction,
): string {
  const lines = summary.readiness_lines;
  switch (key) {
    case "recordings": {
      const line = lines.recordings;
      if (line.table_rows > 0) {
        return t("home.readinessDetail.recordingsTable", {
          count: line.table_rows,
        });
      }
      return t("home.readinessDetail.recordingsWav", { count: line.wav_count });
    }
    case "annotations":
      return t("home.readinessDetail.annotations", {
        annotated: lines.annotations.annotated,
        total: lines.annotations.total,
      });
    case "predict":
      return t("home.readinessDetail.predict", {
        predicted: lines.predict.predicted,
        total: lines.predict.total,
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
