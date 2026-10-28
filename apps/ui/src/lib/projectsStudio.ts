import type { TFunction } from "i18next";
import type {
  ProjectFocus,
  ProjectNextAction,
  ProjectReadinessState,
  ProjectRecord,
  ProjectSummary,
  ProjectTableRow,
  RecordingPredictStatus,
} from "../api/projects";
import type { ReadinessItemKey } from "./projectSummaryFormat";

/** Tabs of the Projects section (m02 / m23 / m24 / m25). */
export type ProjectsTabId = "recordings" | "annotations" | "artifacts" | "parameters";

export const PROJECTS_TABS: readonly ProjectsTabId[] = [
  "recordings",
  "annotations",
  "artifacts",
  "parameters",
];

/** Stable identity — field focus must not allocate a new array each render (BUG-01). */
export const FIELD_PROJECTS_TABS: readonly ProjectsTabId[] = [
  "recordings",
  "parameters",
];

/** Field recognition: Записи + Параметры only (m34). Lab / full keep all four. */
export function projectsTabsForFocus(
  focus: ProjectFocus | null | undefined,
): readonly ProjectsTabId[] {
  if (focus === "recognition") {
    return FIELD_PROJECTS_TABS;
  }
  return PROJECTS_TABS;
}
/** Which mockup state the page is in; drives the subtitle and empty-state copy. */
export type ProjectsPageMode = "none" | "empty" | "field" | "lab" | "full";

export function projectsPageMode(
  project: ProjectRecord | null,
  summary: ProjectSummary | null,
  wavCount: number,
): ProjectsPageMode {
  if (!project) return "none";
  const focus = summary?.focus ?? project.focus ?? null;
  if (wavCount === 0 && (summary?.metrics.recordings ?? 0) === 0) return "empty";
  if (focus === "recognition") return "field";
  if (focus === "training") return "lab";
  return "full";
}

export function focusLabel(focus: ProjectFocus | null | undefined, t: TFunction): string {
  if (!focus) return t("projects.studio.focus.unset");
  return t(`projects.studio.focus.${focus}`);
}

/** Command hint shown on the wizard focus cards (m32) — orcAI CLI names, untranslated. */
export function focusCommandHint(focus: ProjectFocus): string {
  switch (focus) {
    case "recognition":
      return "isl / nor · predict";
    case "training":
      return "create-spectrograms → … → train";
    case "full":
      return "predict + train";
  }
}

export function predictStatusKey(status: RecordingPredictStatus): string {
  return `projects.studio.predictStatus.${status}`;
}

/** Sum of known durations (seconds) across rows. */
export function totalDurationSec(rows: ProjectTableRow[]): number {
  return rows.reduce((acc, row) => acc + (row.duration_sec ?? 0), 0);
}

/** `4.6 h`-style total for the project header; falls back to minutes. */
export function formatTotalHours(sec: number, t: TFunction): string | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const hours = sec / 3600;
  if (hours >= 1) {
    return t("projects.studio.durationHours", { value: hours.toFixed(1) });
  }
  return t("projects.studio.durationMinutes", { value: Math.max(1, Math.round(sec / 60)) });
}

/** `23:12` / `1:02:03` per-row duration (m02 column «Длит.»). */
export function formatRowDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** `48.0 kHz` (mockup style, always one decimal). */
export function formatKHz(hz: number | null | undefined, t: TFunction): string {
  if (hz == null || !Number.isFinite(hz) || hz <= 0) return "—";
  return t("projects.studio.kHz", { value: (hz / 1000).toFixed(1) });
}

/** Unique source rates that orcAI will resample (m02 footer note). */
export function resampleNotes(rows: ProjectTableRow[]): Array<{ from: number; to: number }> {
  const seen = new Map<string, { from: number; to: number }>();
  for (const row of rows) {
    if (row.resample_to_hz && row.sample_rate_hz) {
      const key = `${row.sample_rate_hz}->${row.resample_to_hz}`;
      if (!seen.has(key)) seen.set(key, { from: row.sample_rate_hz, to: row.resample_to_hz });
    }
  }
  return [...seen.values()].sort((a, b) => a.from - b.from);
}

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
      const { annotated, total } = lines.annotations;
      if (annotated === 0) return t("projects.studio.readiness.noAnnotations");
      return t("projects.studio.readiness.annotations", { annotated, total });
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

export type ReadinessCardTone = "ready" | "attention" | "empty";

export function readinessCardTone(
  state: ProjectReadinessState,
  isAttention: boolean,
): ReadinessCardTone {
  if (state === "ready") return "ready";
  if (isAttention) return "attention";
  return "empty";
}

/** Highlighted "do this next" card (m33: recordings amber; m35: datasets amber). */
export function readinessAttentionKey(
  summary: ProjectSummary,
  focus: ProjectFocus,
): ReadinessItemKey | null {
  const r = summary.readiness;
  if (r.recordings !== "ready") return "recordings";
  if (focus !== "recognition" && r.annotations === "needed") return "annotations";
  if (focus !== "recognition" && r.annotations === "ready" && r.datasets !== "ready") {
    return "datasets";
  }
  if (focus !== "training" && r.predict === "needed") return "predict";
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

/** m36 «Следующие шаги»: focus filters which actions appear (aligned with readiness cards). */
export function nextStepsFromSummary(summary: ProjectSummary, focus: ProjectFocus): NextStep[] {
  const lines = summary.readiness_lines;
  const remaining = Math.max(0, lines.predict.total - lines.predict.predicted);
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
    count: lines.annotations.annotated,
  };
  const createTvtStep: NextStep = {
    action: "create_tvt",
    command: "create-spectrograms → … → create-tvt-data",
    route: "/pipeline?view=wizard",
    count: lines.annotations.annotated,
  };
  const filterStep: NextStep = {
    action: "filter",
    command: "filter-predictions",
    route: "/predict",
    routeState: { tab: "filter" },
    count: lines.predict.predicted,
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
    count: Math.max(0, lines.annotations.total - lines.annotations.annotated),
  };

  if (summary.recording_table.sync_status !== "current" && lines.recordings.wav_count > 0) {
    steps.push(syncStep);
  }

  const annotateWanted =
    focus !== "recognition" && summary.readiness.annotations === "needed";
  const predictWanted = remaining > 0 && lines.recordings.state === "ready";
  const trainWanted = lines.annotations.annotated > 0 && lines.datasets.state === "ready";
  const datasetsWanted =
    lines.annotations.annotated > 0 && lines.datasets.state !== "ready";
  const filterWanted = lines.predict.predicted > 0;

  if (focus === "recognition") {
    if (predictWanted) steps.push(predictStep);
    if (filterWanted) steps.push(filterStep);
    return steps;
  }

  if (focus === "training") {
    // Align with readinessAttentionKey: annotate → datasets → train.
    if (annotateWanted) steps.push(annotateStep);
    else if (datasetsWanted) steps.push(createTvtStep);
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

/** m36 green line: predict and a trained model live in the same catalogue. */
export function isFullCycleReady(summary: ProjectSummary): boolean {
  const r = summary.readiness;
  return r.recordings === "ready" && r.predict === "ready" && r.model === "ready";
}

/** `22.08 20:38` — compact timestamp for table footers (m02/m24). */
export function formatShortDateTime(
  tsSec: number | null | undefined,
  locale?: string,
): string {
  if (tsSec == null || !Number.isFinite(tsSec) || tsSec <= 0) return "—";
  const d = new Date(tsSec * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${dd}.${mm} ${time}`;
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

/** Directory that contains an existing project folder. */
export function parentDirOfProject(projectPath: string): string {
  const normalized = projectPath.replace(/[/\\]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

/**
 * Parent folder for a new project.
 * A saved catalog wins. Otherwise stay next to the open project.
 * With neither, use the default root (the user home directory).
 */
export function initialWizardParent(args: {
  projectsRoot: string;
  activeProjectPath?: string | null;
  fallbackRoot?: string | null;
}): string {
  const catalog = args.projectsRoot.trim().replace(/[/\\]+$/, "");
  if (catalog) return catalog;
  const active = args.activeProjectPath?.trim();
  if (active) return parentDirOfProject(active);
  return (args.fallbackRoot ?? "").trim().replace(/[/\\]+$/, "");
}

/** Sidecar raises this when the wizard parent folder is not on disk. */
export function isMissingProjectParentError(message: string): boolean {
  return /parent directory not found/i.test(message);
}

/**
 * Saved catalog that no longer exists falls back to the home directory.
 * A folder the user picked in the dialog stays put, so the wizard can still
 * report that path.
 */
export function wizardParentWhenCatalogMissing(args: {
  parent: string;
  projectsRoot: string;
  fallbackRoot: string;
}): string | null {
  const strip = (value: string) => value.trim().replace(/[/\\]+$/, "");
  const parent = strip(args.parent);
  const catalog = strip(args.projectsRoot);
  const fallback = strip(args.fallbackRoot);
  if (!parent || !catalog || parent !== catalog) return null;
  if (!fallback || fallback === parent) return null;
  return fallback;
}

/** Suggested project folder for the wizard «Каталог» field (m32). */
export function wizardProjectDir(parentDir: string, slug: string): string {
  const parent = parentDir.replace(/[/\\]+$/, "");
  if (!parent) return "";
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return slug ? `${parent}${sep}${slug}` : parent;
}

/** «7 (по параметрам)» / «6 (разметка)» — header metric «Классы». */
export function classesCountLabel(
  calls: string[],
  hasAnnotations: boolean,
  t: TFunction,
): string {
  if (calls.length === 0) return "—";
  const source = hasAnnotations
    ? t("projects.studio.classesFromAnnotations")
    : t("projects.studio.classesFromParameters");
  return `${calls.length} (${source})`;
}
