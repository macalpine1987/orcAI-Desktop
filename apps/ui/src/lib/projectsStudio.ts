import type { TFunction } from "i18next";
import type {
  ProjectFocus,
  ProjectRecord,
  ProjectSummary,
  ProjectTableRow,
  RecordingPredictStatus,
} from "../api/projects";

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

export {
  READINESS_CARD_KEYS,
  attentionCardForStep,
  isFullCycleReady,
  nextStepsFromSummary,
  readinessAttentionKey,
  readinessCardDetail,
  readinessCardDetailKey,
  readinessCardInactiveForFocus,
  readinessCardState,
  readinessCardTone,
  tabForNextAction,
  trainWizardBlockedByAnnotations,
  type NextStep,
  type ReadinessCard,
  type ReadinessCardTone,
} from "./projectsStudioReadiness";

export {
  initialWizardParent,
  isMissingProjectParentError,
  parentDirOfProject,
  wizardParentWhenCatalogMissing,
  wizardProjectDir,
} from "./projectsStudioWizardPaths";
