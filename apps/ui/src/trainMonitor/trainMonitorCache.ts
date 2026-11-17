import type { TrainMonitorSnapshot } from "../api/projects/types";
import { silentCatch } from "../lib/silentCatch";

export const TRAIN_MONITOR_CACHE_KEY = "orcai-desktop.train-monitor-cache.v1";

export type TrainMonitorCacheEntry = {
  snap: TrainMonitorSnapshot;
  logLines: string[];
  logOffset: number;
};

type CacheBlob = Record<string, TrainMonitorCacheEntry>;

const memory = new Map<string, TrainMonitorCacheEntry>();

function readBlob(): CacheBlob {
  try {
    const raw = localStorage.getItem(TRAIN_MONITOR_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    silentCatch("trainMonitorCache")(err);
    return {};
  }
}

function writeBlob(blob: CacheBlob): void {
  try {
    localStorage.setItem(TRAIN_MONITOR_CACHE_KEY, JSON.stringify(blob));
  } catch (err) {
    silentCatch("trainMonitorCache")(err);
  }
}

export function readTrainMonitorCache(
  projectId: string,
): TrainMonitorCacheEntry | null {
  const fromMem = memory.get(projectId);
  if (fromMem) return fromMem;
  const entry = readBlob()[projectId];
  if (!entry?.snap) return null;
  memory.set(projectId, entry);
  return entry;
}

export function writeTrainMonitorCache(
  projectId: string,
  entry: TrainMonitorCacheEntry,
): void {
  memory.set(projectId, entry);
  const blob = readBlob();
  blob[projectId] = {
    snap: entry.snap,
    logLines: entry.logLines.slice(-80),
    logOffset: entry.logOffset,
  };
  writeBlob(blob);
}

function historyEpochCount(snap: TrainMonitorSnapshot): number {
  const hist = snap.history || {};
  let max = 0;
  for (const series of Object.values(hist)) {
    if (Array.isArray(series) && series.length > max) max = series.length;
  }
  return max;
}

/** True when the live snapshot is worth persisting over the previous cache. */
export function trainMonitorCacheShouldWrite(
  prev: TrainMonitorCacheEntry | null,
  next: TrainMonitorCacheEntry,
): boolean {
  if (!prev) return true;
  const a = prev.snap;
  const b = next.snap;
  return (
    a.job_id !== b.job_id ||
    a.phase !== b.phase ||
    a.epoch !== b.epoch ||
    historyEpochCount(a) !== historyEpochCount(b) ||
    prev.logLines.length !== next.logLines.length
  );
}
