import type { TFunction } from "i18next";
import {
  displayOrcaiViewSampleRateHz,
  formatDurationSec,
  formatSampleRateHz,
} from "./formatAudio";
import type { PredictQueueFile } from "../workspace/predictQueue";

/** LCD-style meta next to the current WAV: `48 кГц · канал 1 · 2:24`. */
export function formatPredictTrackMeta(
  file: PredictQueueFile | null | undefined,
  channel: number,
  t: TFunction,
): string {
  if (!file) return "";
  const viewHz = displayOrcaiViewSampleRateHz(file.sample_rate_hz);
  let rate: string | null = null;
  if (viewHz != null && Number.isFinite(viewHz)) {
    if (viewHz >= 1000) {
      const khz = viewHz / 1000;
      const value =
        Math.abs(khz - Math.round(khz)) < 0.05
          ? String(Math.round(khz))
          : khz.toFixed(1);
      rate = t("projects.studio.kHz", { value });
    } else {
      rate = formatSampleRateHz(viewHz);
    }
  }
  const ch =
    channel > 0 ? t("spectrogram.specHeader.channel", { channel }) : null;
  const dur =
    file.duration_sec != null && file.duration_sec > 0
      ? formatDurationSec(file.duration_sec)
      : null;
  return [rate, ch, dur].filter(Boolean).join(" · ");
}
