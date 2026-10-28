/** Nice Y-axis ticks for the train monitor chart. */

/**
 * Round a step to 1 / 2 / 5 × 10^n (Wilkinson-style).
 */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const err = raw / base;
  let nice: number;
  if (err <= 1.5) nice = 1;
  else if (err <= 3) nice = 2;
  else if (err <= 7) nice = 5;
  else nice = 10;
  return nice * base;
}

/**
 * Inclusive nice tick domain covering [min, max] with ~`count` ticks.
 */
export function niceDomain(
  min: number,
  max: number,
  count = 5,
): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  if (max < min) [min, max] = [max, min];
  if (max === min) {
    const pad = Math.abs(min) * 0.05 || 0.05;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const step = niceStep(span / Math.max(1, count - 1));
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Guard against float drift.
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    const rounded = Math.round(v / step) * step;
    ticks.push(Number(rounded.toPrecision(12)));
    if (ticks.length > 24) break;
  }
  if (ticks.length < 2) {
    return {
      min: niceMin,
      max: niceMax || niceMin + step,
      ticks: [niceMin, niceMax || niceMin + step],
    };
  }
  return { min: ticks[0]!, max: ticks[ticks.length - 1]!, ticks };
}

/**
 * Y domain for monitor metrics.
 *
 * MBA / val_MBA live in ~[0, 1]: zoom to the data with padding and round
 * ticks (TensorBoard-style). Do **not** force a full 0–1 frame when the
 * series only spans a band — that flattens early-epoch charts.
 * Empty chart keeps the m14 mockup frame 0.3–0.9.
 */
export function chartYDomain(
  values: number[],
  opts?: { preferUnitInterval?: boolean },
): { min: number; max: number; ticks: number[] } {
  const finite = values.filter((x) => Number.isFinite(x));
  if (!finite.length) {
    // m14 mockup empty frame.
    return { min: 0.3, max: 0.9, ticks: [0.3, 0.45, 0.6, 0.75, 0.9] };
  }
  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  const preferUnit =
    opts?.preferUnitInterval !== false &&
    dataMin >= -0.05 &&
    dataMax <= 1.05;

  if (preferUnit) {
    let span = dataMax - dataMin;
    // Minimum readable window so 2 close points still have headroom.
    const minSpan = 0.2;
    if (span < minSpan) {
      const mid = (dataMin + dataMax) / 2;
      const half = minSpan / 2;
      let lo = mid - half;
      let hi = mid + half;
      if (lo < 0) {
        hi = Math.min(1, hi - lo);
        lo = 0;
      }
      if (hi > 1) {
        lo = Math.max(0, lo - (hi - 1));
        hi = 1;
      }
      return niceDomain(lo, hi, 5);
    }
    const pad = Math.max(span * 0.12, 0.03);
    let lo = dataMin - pad;
    let hi = dataMax + pad;
    lo = Math.max(0, lo);
    hi = Math.min(1, hi);
    // If clamping ate the pad on one side, keep a bit of air on the other.
    if (hi - lo < span + pad * 0.5) {
      if (lo <= 0) hi = Math.min(1, Math.max(hi, dataMax + pad));
      if (hi >= 1) lo = Math.max(0, Math.min(lo, dataMin - pad));
    }
    return niceDomain(lo, hi, 5);
  }

  const pad = (dataMax - dataMin) * 0.12 || 0.05;
  return niceDomain(dataMin - pad, dataMax + pad, 5);
}

/** Format a tick for display (trim trailing zeros). */
export function formatTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value));
  }
  return value.toFixed(2);
}
