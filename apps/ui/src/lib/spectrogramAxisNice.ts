/** Audacity/MATLAB-style “nice” axis step from a raw interval. */
export function niceAxisStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  let nice = 1;
  if (norm > 5) nice = 10;
  else if (norm > 2) nice = 5;
  else if (norm > 1) nice = 2;
  return nice * magnitude;
}

export function targetAxisLabelCount(
  plotSizePx: number,
  minLabelSpacingPx: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const min = bounds.min ?? 2;
  const max = bounds.max ?? 12;
  if (plotSizePx <= 0) return 6;
  return Math.max(min, Math.min(max, Math.floor(plotSizePx / minLabelSpacingPx)));
}
