import { sortLabelsForLegend } from "./labelColors";

/** Vertical band for a class on the spectrogram (thin horizontal stripe, MMS-style). */
export function labelBandLayout(
  label: string,
  allLabels: string[],
  heightPx: number,
): { y: number; bandHeight: number } {
  const sorted = sortLabelsForLegend([...new Set(allLabels)]);
  const norm = label.trim().toLowerCase();
  const idx = sorted.findIndex((l) => l.trim().toLowerCase() === norm);
  const count = sorted.length;
  const topPad = heightPx * 0.1;
  const bottomPad = heightPx * 0.06;
  const inner = Math.max(0, heightPx - topPad - bottomPad);
  const maxBand =
    count > 0 ? Math.max(4, inner / count - (count > 1 ? 1 : 0)) : 32;
  const bandHeight = Math.max(4, Math.min(32, heightPx * 0.11, maxBand));
  const usable = Math.max(0, inner - bandHeight);

  if (idx < 0) {
    return { y: topPad + usable / 2, bandHeight };
  }
  if (count <= 1) {
    return { y: topPad + usable / 2, bandHeight };
  }

  const y = topPad + (idx / (count - 1)) * usable;
  return { y, bandHeight };
}
