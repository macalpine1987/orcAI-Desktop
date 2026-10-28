/** Collapsed dock bar: blend completed files with in-file job progress (0–100). */
export function predictBatchStripPercent(
  done: number,
  total: number,
  currentFilePct: number | null,
): number {
  if (total <= 0) return 0;
  const fileFraction =
    currentFilePct != null
      ? Math.min(1, Math.max(0, currentFilePct / 100))
      : 0;
  return Math.round(((done + fileFraction) / total) * 100);
}
