import type { PredictTabId } from "../components/PredictTabs";

const TAB_STORAGE_KEY = "orcai.predict.activeTab";

const VALID_TABS: PredictTabId[] = ["run", "results", "filter"];

const LEGACY_TAB_MAP: Record<string, PredictTabId> = {
  recognition: "run",
  queue: "run",
  spectrogram: "results",
};

const DEFAULT_TAB: PredictTabId = "run";

function normalizeStoredTab(raw: string | null): PredictTabId | null {
  if (!raw) return null;
  if (raw === "more") return DEFAULT_TAB;
  if (VALID_TABS.includes(raw as PredictTabId)) return raw as PredictTabId;
  return LEGACY_TAB_MAP[raw] ?? null;
}

export function loadPredictActiveTab(): PredictTabId {
  try {
    const tab = normalizeStoredTab(sessionStorage.getItem(TAB_STORAGE_KEY));
    if (tab) return tab;
  } catch {
    /* private mode / unavailable */
  }
  return DEFAULT_TAB;
}

export function savePredictActiveTab(tab: PredictTabId): void {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function resolvePredictActiveTab(
  tab: PredictTabId,
  ctx: {
    queueReady: boolean;
    resultsEnabled: boolean;
    filterEnabled: boolean;
    /** Keep a nav-requested tab while the queue is still loading. */
    queueLoading?: boolean;
  },
): PredictTabId {
  if (ctx.queueLoading) return tab;
  if (!ctx.queueReady) {
    if (tab === "results" || tab === "filter") return DEFAULT_TAB;
    return tab;
  }
  if (tab === "results" && !ctx.resultsEnabled) return DEFAULT_TAB;
  if (tab === "filter" && !ctx.filterEnabled) return DEFAULT_TAB;
  return tab;
}

/** Map navigation state tab (may be legacy) to current tab id. */
export function normalizePredictNavTab(
  tab: string | undefined,
): PredictTabId | undefined {
  if (!tab) return undefined;
  if (tab === "filter") return "filter";
  return normalizeStoredTab(tab) ?? undefined;
}
