import type { SpectrogramMeta } from "../api/spectrogram";

/** orcAI default spectrogram.freq_range upper bound (not Nyquist). */
export const ORCAI_DEFAULT_AXIS_MAX_HZ = 16_000;

/**
 * Top of the spectrogram Y axis (Hz). Viewer uses a fixed 16 kHz linear scale
 * matching orcAI model spectrograms.
 */
export function spectrogramAxisMaxHz(meta?: SpectrogramMeta): number {
  const fromMeta = meta?.axis_max_hz;
  if (typeof fromMeta === "number" && Number.isFinite(fromMeta) && fromMeta > 0) {
    return fromMeta;
  }
  return ORCAI_DEFAULT_AXIS_MAX_HZ;
}

export function formatAxisFrequencyHz(hz: number): string {
  if (!Number.isFinite(hz) || hz < 0) return "—";
  if (hz >= 1000) {
    const khz = hz / 1000;
    const rounded =
      Math.abs(khz - Math.round(khz)) < 0.05
        ? Math.round(khz).toString()
        : khz.toFixed(1);
    return `${rounded} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}
