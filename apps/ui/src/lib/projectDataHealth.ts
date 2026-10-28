/** Shell banner: pick one advisory data-health message for the active project. */

import type { ProjectFocus } from "../api/projects";

export type ProjectDataHealth = {
  table_stale: boolean;
  missing_wav: number;
  unpaired_ann: number;
  ann_gap: number;
};

export type DataHealthCode =
  | "table_stale"
  | "missing_wav"
  | "unpaired_ann"
  | "ann_gap";

export type DataHealthPick = {
  code: DataHealthCode;
  count: number;
  /** i18n key under `shellHealth.*` */
  messageKey: string;
};

function positiveCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v > 0 ? v : 0;
}

/** Normalize API payload (missing field → empty health). */
export function normalizeDataHealth(
  raw: Partial<ProjectDataHealth> | null | undefined,
): ProjectDataHealth {
  return {
    table_stale: Boolean(raw?.table_stale),
    missing_wav: positiveCount(raw?.missing_wav),
    unpaired_ann: positiveCount(raw?.unpaired_ann),
    ann_gap: positiveCount(raw?.ann_gap),
  };
}

/**
 * Candidates in priority order: table_stale → missing_wav → unpaired_ann → ann_gap.
 * Recognition focus: only table_stale + missing_wav (no annotation noise).
 * ``skip``: session-dismissed codes — show the next applicable warning instead of silence.
 */
export function pickDataHealthMessage(
  health: ProjectDataHealth | null | undefined,
  focus: ProjectFocus | null | undefined,
  skip?: ReadonlySet<DataHealthCode> | readonly DataHealthCode[] | null,
): DataHealthPick | null {
  const h = normalizeDataHealth(health);
  const skipped = skip
    ? skip instanceof Set
      ? skip
      : new Set(skip)
    : null;
  const trainingLike = focus === "training" || focus === "full";

  const candidates: DataHealthPick[] = [];
  if (h.table_stale) {
    candidates.push({
      code: "table_stale",
      count: 0,
      messageKey: "shellHealth.tableStale",
    });
  }
  if (h.missing_wav > 0) {
    candidates.push({
      code: "missing_wav",
      count: h.missing_wav,
      messageKey: "shellHealth.missingWav",
    });
  }
  if (trainingLike) {
    if (h.unpaired_ann > 0) {
      candidates.push({
        code: "unpaired_ann",
        count: h.unpaired_ann,
        messageKey: "shellHealth.unpairedAnn",
      });
    }
    if (h.ann_gap > 0) {
      candidates.push({
        code: "ann_gap",
        count: h.ann_gap,
        messageKey: "shellHealth.annGap",
      });
    }
  }

  for (const pick of candidates) {
    if (skipped?.has(pick.code)) continue;
    return pick;
  }
  return null;
}

const DISMISS_PREFIX = "orcai-desktop.data-health-dismiss:";

export function dataHealthDismissKey(
  projectId: string,
  code: DataHealthCode,
): string {
  return `${DISMISS_PREFIX}${projectId}:${code}`;
}

export function isDataHealthDismissed(
  projectId: string,
  code: DataHealthCode,
): boolean {
  try {
    return sessionStorage.getItem(dataHealthDismissKey(projectId, code)) === "1";
  } catch {
    return false;
  }
}

export function dismissDataHealth(projectId: string, code: DataHealthCode): void {
  try {
    sessionStorage.setItem(dataHealthDismissKey(projectId, code), "1");
  } catch {
    /* ignore */
  }
}

/** Codes dismissed for this project in the current session. */
export function dismissedDataHealthCodes(
  projectId: string,
): Set<DataHealthCode> {
  const all: DataHealthCode[] = [
    "table_stale",
    "missing_wav",
    "unpaired_ann",
    "ann_gap",
  ];
  const out = new Set<DataHealthCode>();
  for (const code of all) {
    if (isDataHealthDismissed(projectId, code)) out.add(code);
  }
  return out;
}
