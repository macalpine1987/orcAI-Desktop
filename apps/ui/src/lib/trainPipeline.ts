import type {
  PipelineActivePlan,
  PipelineArtifactKind,
  PipelineStepStatus,
  ProjectPipeline,
} from "../api/projects";

export const TRAIN_PIPELINE_STEP_IDS = [
  "create-spectrograms",
  "create-label-arrays",
  "create-snippet-table",
  "create-tvt-snippet-tables",
  "create-tvt-data",
  "hpsearch",
  "train",
  "test",
] as const;

export const PIPELINE_STATUSES: PipelineStepStatus[] = [
  "idle",
  "queued",
  "running",
  "done",
  "stale",
  "blocked",
  "error",
];

export function formatPipelineStamp(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return "—";
  const d = new Date(ts * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}

export function formatBytesLocalized(
  bytes: number | null | undefined,
  locale: string,
): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const ru = locale.startsWith("ru");
  const units = ru
    ? (["Б", "КБ", "МБ", "ГБ"] as const)
    : (["B", "KB", "MB", "GB"] as const);
  if (bytes < 1024) return `${Math.round(bytes)} ${units[0]}`;
  if (bytes < 1024 * 1024) {
    const n = bytes / 1024;
    return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[1]}`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    const n = bytes / (1024 * 1024);
    return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[2]}`;
  }
  const n = bytes / (1024 * 1024 * 1024);
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} ${units[3]}`;
}

export function artifactCountKey(kind: PipelineArtifactKind): string {
  switch (kind) {
    case "recordings":
      return "pipeline.meta.recordings";
    case "rows":
      return "pipeline.meta.rows";
    case "tables":
      return "pipeline.meta.tables";
    case "datasets":
      return "pipeline.meta.datasets";
    case "models":
      return "pipeline.meta.models";
    default:
      return "pipeline.meta.files";
  }
}

export function splitLabel(train: number, val: number, test: number): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
  return `${fmt(train)} / ${fmt(val)} / ${fmt(test)}`;
}

/** Label-dependent pipeline steps stay off while every loaded WAV lacks a .txt. */
export function pipelineBlockedWithoutAnnotations(
  board: ProjectPipeline | null | undefined,
): boolean {
  const ann = board?.readiness.annotations;
  if (!ann) return false;
  return (ann.wav_count ?? 0) > 0 && (ann.paired ?? 0) <= 0;
}

/**
 * While a wizard plan is active and did not opt into hpsearch, the board must
 * not offer a manual ``hpsearch`` run (cancel/finish plan restores the step).
 */
export function wizardPlanBlocksHpsearch(
  plan: PipelineActivePlan | null | undefined,
): boolean {
  if (!plan?.plan_id) return false;
  if (typeof plan.includes_hpsearch === "boolean") {
    return !plan.includes_hpsearch;
  }
  if (Array.isArray(plan.commands)) {
    return !plan.commands.includes("hpsearch");
  }
  // Optimistic plan without flags: assume default wizard plan (no hpsearch).
  return true;
}
