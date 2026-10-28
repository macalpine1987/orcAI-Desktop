/** Client-side clock helpers for the train monitor (smooth ETA / elapsed). */

export function estimateRemainingSec(opts: {
  startedAt: number | null | undefined;
  now?: number;
  epoch: number;
  epochs: number;
  batch: number;
  batches: number | null | undefined;
  /** Epochs of EarlyStopping patience still left (no improvement). */
  earlyStopEpochsLeft?: number | null;
}): number | null {
  const now = opts.now ?? Date.now() / 1000;
  const started = opts.startedAt;
  if (started == null || !(started > 0)) return null;
  const elapsed = Math.max(0, now - started);
  const epochs = Math.max(1, opts.epochs || 1);
  const epochIdx = Math.max(0, (opts.epoch || 1) - 1);
  let inner = 0;
  if (opts.batches && opts.batches > 0) {
    inner = Math.min(1, Math.max(0, opts.batch / opts.batches));
  }
  const doneUnits = epochIdx + inner;
  const frac = doneUnits / epochs;
  // First epoch: wait until ~5% of the epoch (or 10 batches) before estimating.
  if (opts.epoch <= 1) {
    const batchOk =
      opts.batches != null &&
      opts.batches > 0 &&
      opts.batch > Math.max(10, Math.floor(opts.batches * 0.05));
    if (!batchOk && frac < 0.02) return null;
  }
  if (frac <= 0.01 || doneUnits <= 0.02) return null;

  const remFull = (elapsed * (1 - frac)) / frac;

  // Cap by early-stopping horizon when the board is not improving.
  const esLeft = opts.earlyStopEpochsLeft;
  if (esLeft != null && Number.isFinite(esLeft) && esLeft >= 0) {
    const unitsLeft = 1 - inner + esLeft;
    const remEs = (elapsed * unitsLeft) / doneUnits;
    return Math.min(remFull, remEs);
  }
  return remFull;
}

export function liveElapsedSec(opts: {
  startedAt: number | null | undefined;
  fallbackElapsed: number | null | undefined;
  running: boolean;
  now?: number;
}): number | null {
  const now = opts.now ?? Date.now() / 1000;
  if (opts.running && opts.startedAt != null && opts.startedAt > 0) {
    return Math.max(0, now - opts.startedAt);
  }
  if (opts.fallbackElapsed != null && Number.isFinite(opts.fallbackElapsed)) {
    return opts.fallbackElapsed;
  }
  return null;
}
