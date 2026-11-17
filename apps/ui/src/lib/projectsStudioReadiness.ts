/**
 * Projects studio readiness cards / next steps (m36).
 */
import type { TFunction } from "i18next";
import type {
  ProjectFocus,
  ProjectNextAction,
  ProjectReadinessState,
  ProjectSummary,
} from "../api/projects";
import type { ReadinessItemKey } from "./projectSummaryFormat";

/** Local alias — keep barrel as the public ProjectsTabId source. */
type ProjectsTabId = "recordings" | "annotations" | "artifacts" | "parameters";

export type ReadinessCard = {
  key: ReadinessItemKey;
  state: ProjectReadinessState;
};

export const READINESS_CARD_KEYS: readonly ReadinessItemKey[] = [
  "recordings",
  "annotations",
  "predict",
  "datasets",
  "model",
];

/**
 * Focus-aware readiness detail for cards that are "not needed" for the chosen
 * path (field: annotations/datasets; lab: predict — «не требуется»).
 */
export function readinessCardDetailKey(
  key: ReadinessItemKey,
  state: ProjectReadinessState,
  focus: ProjectFocus,
): string | null {
  if (
    focus === "recognition" &&
    (key === "annotations" || key === "datasets" || key === "model")
  ) {
    return "projects.studio.readiness.notRequiredForFocus";
  }
  if (focus === "training" && key === "predict") {
    return "projects.studio.readiness.notRequiredForFocus";
  }
  if (state !== "empty") return null;
  if (focus === "training" && key === "datasets") {
    return "projects.studio.readiness.needsPipeline";
  }
  return null;
}

/** Soft-focus cards that stay visible but inactive (not on the chosen path). */
export function readinessCardInactiveForFocus(
  key: ReadinessItemKey,
  focus: ProjectFocus,
): boolean {
  if (focus === "recognition") {
    return key === "annotations" || key === "datasets" || key === "model";
  }
  if (focus === "training") {
    return key === "predict";
  }
  return false;
}

/**
 * Card detail line (m36 style: «12 WAV · таблица актуальна», «9 из 12 с аннотациями»,
 * «7 predicted.txt», «tvt_data готов», «models/ · isl-v1»).
 */
export function readinessCardDetail(
  summary: ProjectSummary,
  key: ReadinessItemKey,
  focus: ProjectFocus,
  t: TFunction,
): string {
  const focusKey = readinessCardDetailKey(key, summary.readiness[key], focus);
  if (focusKey) return t(focusKey);
  const lines = summary.readiness_lines;
  switch (key) {
    case "recordings": {
      const count = lines.recordings.wav_count;
      if (count === 0) return t("projects.studio.readiness.addWav");
      const sync = summary.recording_table.sync_status;
      const k =
        sync === "current"
          ? "tableCurrent"
          : sync === "stale"
            ? "tableStale"
            : "tableMissing";
      return t(`projects.studio.readiness.${k}`, { count });
    }
    case "annotations": {
      const shown = annotationLampCounts(lines);
      if (shown.paired === 0) return t("projects.studio.readiness.noAnnotations");
      return t("projects.studio.readiness.annotations", {
        annotated: shown.paired,
        total: shown.total,
      });
    }
    case "predict": {
      const { predicted, total } = lines.predict;
      if (predicted === 0) return t("projects.studio.readiness.noData");
      if (predicted >= total) {
        return t("projects.studio.readiness.predicted", { predicted });
      }
      return t("projects.studio.readiness.predictedOf", { predicted, total });
    }
    case "datasets":
      if (lines.datasets.file_count > 0) return t("projects.studio.readiness.tvtReady");
      return lines.datasets.has_tvt_dir
        ? t("projects.studio.readiness.tvtEmpty")
        : t("projects.studio.readiness.noData");
    case "model":
      if (lines.model.model_name) {
        return t("projects.studio.readiness.model", {
          name: lines.model.model_name.replace(/^orcai-/i, ""),
        });
      }
      if (lines.model.checkpoint_count > 0) {
        return t("projects.studio.readiness.checkpoints", {
          count: lines.model.checkpoint_count,
        });
      }
      return t("projects.studio.readiness.noData");
  }
}

/**
 * Lamp state for one readiness card.
 * Annotations follow stem-matched `.txt` files when the summary includes
 * `paired_files`. A table row with another name does not turn the lamp green.
 * Older summaries omit the field and keep the sidecar state.
 */
export function readinessCardState(
  summary: ProjectSummary,
  key: ReadinessItemKey,
): ProjectReadinessState {
  if (key !== "annotations") return summary.readiness[key];
  const line = summary.readiness_lines.annotations;
  if (typeof line.paired_files !== "number") return summary.readiness.annotations;
  const shown = annotationLampCounts(summary.readiness_lines);
  if (shown.paired > 0) return "ready";
  return shown.total > 0 ? "needed" : "empty";
}

export type ReadinessCardTone = "ready" | "attention" | "empty";

export function readinessCardTone(
  state: ProjectReadinessState,
  isAttention: boolean,
): ReadinessCardTone {
  if (isAttention) return "attention";
  if (state === "ready") return "ready";
  return "empty";
}

/** Readiness card that belongs to a next step. Filter has no card. */
export function attentionCardForStep(
  action: ProjectNextAction,
): ReadinessItemKey | null {
  switch (action) {
    case "sync_table":
      return "recordings";
    case "annotate":
      return "annotations";
    case "create_tvt":
      return "datasets";
    case "predict":
      return "predict";
    case "train":
      return "model";
    default:
      return null;
  }
}

/**
 * Yellow lamp follows the first next step that has a card.
 * Recordings win while the table is missing or stale, and on an empty project.
 */
export function readinessAttentionKey(
  summary: ProjectSummary,
  focus: ProjectFocus,
): ReadinessItemKey | null {
  if (summary.readiness.recordings !== "ready") return "recordings";
  for (const step of nextStepsFromSummary(summary, focus)) {
    const card = attentionCardForStep(step.action);
    if (card && !readinessCardInactiveForFocus(card, focus)) return card;
  }
  return null;
}

export type NextStep = {
  action: ProjectNextAction;
  /** orcAI command line shown under the title (untranslated). */
  command: string;
  route: string;
  routeState?: Record<string, unknown>;
  count: number;
};

/**
 * Numerator is a `.txt` whose name matches a WAV. The denominator is the WAV
 * count, so the lamp and the «add annotations» step describe the same files.
 * Without `paired_files`, the table's own annotated/total pair is kept.
 */
function annotationLampCounts(
  lines: ProjectSummary["readiness_lines"],
): { paired: number; total: number } {
  const line = lines.annotations;
  if (typeof line.paired_files !== "number") {
    const annotated = Number.isFinite(line.annotated) ? Math.max(0, line.annotated) : 0;
    const total = Number.isFinite(line.total) ? Math.max(0, line.total) : 0;
    return { paired: annotated, total };
  }
  const paired = pairedAnnotationCount(line);
  const wav = Number.isFinite(lines.recordings.wav_count)
    ? Math.max(0, lines.recordings.wav_count)
    : 0;
  const tableTotal = Number.isFinite(line.total) ? Math.max(0, line.total) : 0;
  return { paired, total: wav > 0 ? wav : tableTotal };
}

/**
 * Labels the training wizard will accept: a `.txt` whose name matches a WAV.
 * Older summaries omit `paired_files`; then the table's annotation count is used.
 */
function pairedAnnotationCount(
  line: ProjectSummary["readiness_lines"]["annotations"],
): number {
  const raw = typeof line.paired_files === "number" ? line.paired_files : line.annotated;
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/** WAV files that still have no stem-matched annotation. */
function recordingsMissingPairedAnnotation(
  lines: ProjectSummary["readiness_lines"],
): number {
  const wavs = Number.isFinite(lines.recordings.wav_count)
    ? Math.max(0, lines.recordings.wav_count)
    : 0;
  return Math.max(0, wavs - pairedAnnotationCount(lines.annotations));
}

/**
 * Predictions still needing filter-predictions. Prefer sidecar ``unfiltered``
 * (missing/older ``*_predicted_filtered.txt``). Older summaries fall back to
 * the predicted count.
 */
function predictionsNeedingFilter(
  lines: ProjectSummary["readiness_lines"],
): number {
  const raw =
    typeof lines.predict.unfiltered === "number"
      ? lines.predict.unfiltered
      : lines.predict.predicted;
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/** m36 «Следующие шаги»: focus filters which actions appear (aligned with readiness cards). */
export function nextStepsFromSummary(summary: ProjectSummary, focus: ProjectFocus): NextStep[] {
  const lines = summary.readiness_lines;
  const remaining = Math.max(0, lines.predict.total - lines.predict.predicted);
  const paired = pairedAnnotationCount(lines.annotations);
  const annotationGap = recordingsMissingPairedAnnotation(lines);
  const needsFilter = predictionsNeedingFilter(lines);
  const steps: NextStep[] = [];

  const predictModel =
    summary.predict_model?.trim() ||
    summary.primary_model_name?.trim() ||
    "orcai-isl-v1";
  const predictStep: NextStep = {
    action: "predict",
    command: `predict · ${predictModel}`,
    route: "/predict",
    routeState: { tab: "run" },
    count: remaining,
  };
  const trainStep: NextStep = {
    action: "train",
    command: lines.model.state === "ready" ? "train · -lmf" : "train",
    route: "/pipeline?view=wizard",
    count: paired,
  };
  const createTvtStep: NextStep = {
    action: "create_tvt",
    command: "create-spectrograms → … → create-tvt-data",
    route: "/pipeline?view=wizard",
    count: paired,
  };
  const filterStep: NextStep = {
    action: "filter",
    command: "filter-predictions",
    route: "/predict",
    routeState: { tab: "filter" },
    count: needsFilter,
  };
  const syncStep: NextStep = {
    action: "sync_table",
    command: "create-recording-table -ut -up",
    route: "/projects",
    count: lines.recordings.wav_count,
  };
  const annotateStep: NextStep = {
    action: "annotate",
    command: "annotations/*.txt",
    route: "/projects",
    count: annotationGap,
  };

  if (summary.recording_table.sync_status !== "current" && lines.recordings.wav_count > 0) {
    steps.push(syncStep);
  }

  const annotateWanted = focus !== "recognition" && annotationGap > 0;
  const predictWanted = remaining > 0 && lines.recordings.state === "ready";
  // Wizard steps need a stem-matched .txt. A CSV path with another name does not count.
  const trainWanted = paired > 0 && lines.datasets.state === "ready";
  const datasetsWanted = paired > 0 && lines.datasets.state !== "ready";
  const filterWanted = needsFilter > 0;

  if (focus === "recognition") {
    if (predictWanted) steps.push(predictStep);
    if (filterWanted) steps.push(filterStep);
    return steps;
  }

  if (focus === "training") {
    // Remaining WAV files stay on the list even when some labels already exist.
    if (annotateWanted) steps.push(annotateStep);
    if (datasetsWanted) steps.push(createTvtStep);
    else if (trainWanted) steps.push(trainStep);
    return steps;
  }

  // full cycle — order matches readinessAttentionKey (BUG-P-02 / BUG-P-04).
  if (annotateWanted) steps.push(annotateStep);
  if (datasetsWanted) steps.push(createTvtStep);
  if (predictWanted) steps.push(predictStep);
  if (trainWanted) steps.push(trainStep);
  if (filterWanted) steps.push(filterStep);
  return steps;
}

/** Which Projects tab hosts the CTA for a next-step action (null = navigates away). */
export function tabForNextAction(action: ProjectNextAction): ProjectsTabId | null {
  switch (action) {
    case "sync_table":
    case "predict":
      return "recordings";
    case "train":
    case "annotate":
      return "annotations";
    case "create_tvt":
      // Pipeline hosts the real CTA; Artifacts is read-only (BUG-P-03).
      return null;
    default:
      return null;
  }
}

/**
 * Green line: every recording already has a prediction, and a model lives in
 * this catalogue. One predicted file is not enough. The sentence stays as written.
 */
export function isFullCycleReady(summary: ProjectSummary): boolean {
  const predicted = summary.readiness_lines.predict.predicted;
  const total = summary.readiness_lines.predict.total;
  const allPredicted =
    Number.isFinite(predicted) &&
    Number.isFinite(total) &&
    total > 0 &&
    predicted >= total;
  return (
    summary.readiness.recordings === "ready" &&
    summary.readiness.model === "ready" &&
    allPredicted
  );
}

/**
 * Projects «Мастер обучения» stays inactive until a WAV has a matching .txt.
 * Prefer the disk count. Older summaries only have the CSV-merged metric.
 */
export function trainWizardBlockedByAnnotations(
  summary: Pick<ProjectSummary, "readiness_lines"> | null | undefined,
): boolean {
  const line = summary?.readiness_lines.annotations;
  if (!line) return true;
  if (typeof line.paired_files === "number") return line.paired_files <= 0;
  return line.annotated <= 0;
}
