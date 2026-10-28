import type { SpectrogramDisplayKind } from "./spectrogramView";

/** Invert mel scale (Hz) for cursor readout in log-mel view. */
export function hzFromMel(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function melFromHz(hz: number): number {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

export type SpectrogramCursorFrequency = {
  hz: number;
  display: string;
  isApproximate: boolean;
};

/**
 * Map vertical position (0 = top, 1 = bottom) to a frequency readout.
 */
/** Vertical fraction (0 = top/high Hz) for a frequency on the spectrogram axis. */
export function yFracFromHz(
  displayKind: SpectrogramDisplayKind,
  hz: number,
  nyquistHz: number,
): number {
  const clampedHz = Math.max(0, Math.min(hz, nyquistHz));
  // ``orcai`` tiles are linear STFT (freq_range); treat like linear for Y mapping.
  if (displayKind === "linear" || displayKind === "orcai") {
    return 1 - clampedHz / nyquistHz;
  }
  const melMax = melFromHz(nyquistHz);
  if (melMax <= 0) return 0.5;
  return 1 - melFromHz(clampedHz) / melMax;
}

export type SpectrogramTfBoxLayout = {
  topPct: number;
  heightPct: number;
};

const MIN_BOX_HEIGHT_PCT = 2.5;

/**
 * TF boxes that span most of the Y axis look like vertical strips (not MMS
 * horizontal class bands). Prefer class lanes when the estimated bandwidth
 * is too wide relative to the viewer axis.
 */
export function shouldUseTfOverlayBox(
  hzMin: number,
  hzMax: number,
  axisMaxHz: number,
  maxSpanFraction = 0.4,
): boolean {
  if (!(axisMaxHz > 0) || !(hzMax > hzMin)) return false;
  return (hzMax - hzMin) / axisMaxHz <= maxSpanFraction;
}

/**
 * Map Hz bounds to overlay box geometry (matches spectrogram Y axis).
 */
export function tfBoxLayoutFromHz(
  displayKind: SpectrogramDisplayKind,
  hzMin: number,
  hzMax: number,
  nyquistHz: number,
): SpectrogramTfBoxLayout {
  const lo = Math.min(hzMin, hzMax);
  const hi = Math.max(hzMin, hzMax);
  const yTop = yFracFromHz(displayKind, hi, nyquistHz);
  const yBottom = yFracFromHz(displayKind, lo, nyquistHz);
  const topPct = Math.max(0, Math.min(100, yTop * 100));
  const heightPct = Math.max(
    MIN_BOX_HEIGHT_PCT,
    Math.min(100 - topPct, (yBottom - yTop) * 100),
  );
  return { topPct, heightPct };
}

export function frequencyAtCursor(
  displayKind: SpectrogramDisplayKind,
  yFracTopDown: number,
  nyquistHz: number,
): SpectrogramCursorFrequency {
  const y = Math.max(0, Math.min(1, yFracTopDown));
  const linearHz = (1 - y) * nyquistHz;

  if (displayKind === "linear" || displayKind === "orcai") {
    return {
      hz: linearHz,
      display: `${Math.round(linearHz)} Hz`,
      isApproximate: false,
    };
  }

  const melMax = melFromHz(nyquistHz);
  const mel = (1 - y) * melMax;
  const hz = hzFromMel(mel);
  return {
    hz,
    display: `~${Math.round(hz)} Hz`,
    isApproximate: true,
  };
}
