import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatPredictTrackMeta } from "./predictTrackMeta";
import type { PredictQueueFile } from "../workspace/predictQueue";

const t = ((key: string, opts?: Record<string, unknown>) => {
  if (key === "projects.studio.kHz") return `${opts?.value} кГц`;
  if (key === "spectrogram.specHeader.channel") return `канал ${opts?.channel}`;
  return key;
}) as TFunction;

function wav(extra?: Partial<PredictQueueFile>): PredictQueueFile {
  return {
    name: "10 Slow Motion.wav",
    path: "/p/10 Slow Motion.wav",
    kind: "wav",
    bit_depth: 16,
    sample_rate_hz: 48_000,
    duration_sec: 144,
    status: "done",
    ...extra,
  };
}

describe("formatPredictTrackMeta", () => {
  it("matches Analysis chrome: rate · channel · duration", () => {
    expect(formatPredictTrackMeta(wav(), 1, t)).toBe("48 кГц · канал 1 · 2:24");
  });

  it("returns empty without a file", () => {
    expect(formatPredictTrackMeta(null, 1, t)).toBe("");
  });
});
