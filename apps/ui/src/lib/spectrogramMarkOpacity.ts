/** Toolbar slider 0–100; 50 = current default overlay strength. */
export const SPECTROGRAM_MARK_OPACITY_DEFAULT = 50;

export const SPECTROGRAM_MARK_OPACITY_STORAGE_KEY =
  "orcai-spectrogram-mark-opacity";

export function clampMarkOpacity(value: number): number {
  if (!Number.isFinite(value)) return SPECTROGRAM_MARK_OPACITY_DEFAULT;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Scale a base overlay opacity (0–1) by the toolbar slider. */
export function scaleMarkOpacity(
  baseOpacity: number,
  slider: number,
): number {
  const factor = clampMarkOpacity(slider) / SPECTROGRAM_MARK_OPACITY_DEFAULT;
  return Math.min(1, Math.max(0, baseOpacity * factor));
}

export function loadStoredMarkOpacity(): number {
  try {
    const raw = localStorage.getItem(SPECTROGRAM_MARK_OPACITY_STORAGE_KEY);
    if (raw == null) return SPECTROGRAM_MARK_OPACITY_DEFAULT;
    return clampMarkOpacity(Number(raw));
  } catch {
    return SPECTROGRAM_MARK_OPACITY_DEFAULT;
  }
}

export function storeMarkOpacity(value: number): void {
  try {
    localStorage.setItem(
      SPECTROGRAM_MARK_OPACITY_STORAGE_KEY,
      String(clampMarkOpacity(value)),
    );
  } catch {
    /* ignore */
  }
}
