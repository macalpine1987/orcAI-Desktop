import type { LabelSegment } from "../api/labels";

export type LabelTimeUnit = "seconds" | "frames";

export type SegmentTimeInput = Pick<
  LabelSegment,
  "start" | "stop" | "start_sec" | "stop_sec"
> & { time_unit?: LabelTimeUnit };

/** Resolve segment bounds in seconds for spectrogram / lane layout. */
export function segmentTimeSec(
  seg: SegmentTimeInput,
  deltaT: number | null | undefined,
  durationSec?: number,
  timeUnit?: LabelTimeUnit,
): { t0: number; t1: number } {
  const unit =
    timeUnit ??
    seg.time_unit ??
    inferTimeUnit(seg, durationSec);

  const start = Number(seg.start);
  const stop = Number(seg.stop);

  if (unit === "seconds") {
    return normalizeSegmentBounds(start, stop, 0.05);
  }

  const dt =
    deltaT != null && deltaT > 0
      ? deltaT
      : durationSec != null && durationSec > 0
        ? durationSec / Math.max(stop, 1)
        : 1;

  if (seg.start_sec != null && seg.stop_sec != null) {
    const span = seg.stop_sec - seg.start_sec;
    if (span > 0 && seg.stop_sec <= (durationSec ?? Infinity) * 1.05) {
      return normalizeSegmentBounds(seg.start_sec, seg.stop_sec, dt);
    }
  }

  return normalizeSegmentBounds(start * dt, stop * dt, dt);
}

function inferTimeUnit(
  seg: Pick<LabelSegment, "start" | "stop">,
  durationSec?: number,
): LabelTimeUnit {
  const start = Number(seg.start);
  const stop = Number(seg.stop);
  if (
    Math.abs(start - Math.round(start)) > 1e-6 ||
    Math.abs(stop - Math.round(stop)) > 1e-6
  ) {
    return "seconds";
  }
  if (durationSec != null && durationSec > 0 && stop <= durationSec * 1.05) {
    return "seconds";
  }
  return "frames";
}

function normalizeSegmentBounds(
  t0: number,
  t1: number,
  minSpan: number,
): { t0: number; t1: number } {
  let a = t0;
  let b = t1;
  if (b < a) {
    const swap = a;
    a = b;
    b = swap;
  }
  if (b <= a) {
    b = a + minSpan;
  }
  return { t0: a, t1: b };
}

export function effectiveLabelDeltaT(
  deltaT: number | null | undefined,
  segments: Pick<LabelSegment, "stop">[],
  durationSec: number,
  timeUnit?: LabelTimeUnit,
): number | null {
  if (timeUnit === "seconds") return 1;
  if (deltaT != null && deltaT > 0) return deltaT;
  if (durationSec <= 0 || segments.length === 0) return null;
  const maxFrame = Math.max(...segments.map((s) => s.stop), 1);
  return durationSec / maxFrame;
}
