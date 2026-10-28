/** Matches sidecar `ORCAI_VIEW_SAMPLE_RATE_HZ` (orcAI 48 kHz). */
export const ORCAI_VIEW_SAMPLE_RATE_HZ = 48_000;

/** Human-readable sample rate (e.g. 384 kHz, 48 kHz, 44.1 kHz). */
export function formatSampleRateHz(hz: number | null | undefined): string {
  if (hz == null || !Number.isFinite(hz)) return "—";
  if (hz >= 1000) {
    const khz = hz / 1000;
    // Prefer integer kHz when within 0.05 (48000 → 48); keep one decimal for 44.1.
    const rounded =
      Math.abs(khz - Math.round(khz)) < 0.05
        ? Math.round(khz).toString()
        : khz.toFixed(1);
    return `${rounded} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

/**
 * Working / view sample rate when spectrogram meta is not loaded yet.
 * Mirrors sidecar `spectrogram_view_sample_rate`: native below 48 kHz → 48 kHz.
 */
export function displayOrcaiViewSampleRateHz(
  nativeHz: number | null | undefined,
): number | null {
  if (nativeHz == null || !Number.isFinite(nativeHz) || nativeHz <= 0) {
    return null;
  }
  return nativeHz < ORCAI_VIEW_SAMPLE_RATE_HZ
    ? ORCAI_VIEW_SAMPLE_RATE_HZ
    : nativeHz;
}

/**
 * Rate shown in the spectrogram chrome: orcAI working / view rate when
 * available (resampling), otherwise the native WAV rate (with 48 kHz floor).
 */
export function displaySpectrogramSampleRateHz(meta: {
  sample_rate?: number | null;
  effective_sample_rate?: number | null;
}): number | null {
  const effective = meta.effective_sample_rate;
  if (effective != null && Number.isFinite(effective) && effective > 0) {
    return effective;
  }
  return displayOrcaiViewSampleRateHz(meta.sample_rate);
}

export function formatBitDepth(bits: number | null | undefined): string {
  if (bits == null || !Number.isFinite(bits)) return "—";
  return `${bits} bit`;
}

/** Human-readable duration (e.g. 1:23:45 or 12.3 s). */
export function formatDurationSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Human-readable file size (e.g. 172 MB). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
}