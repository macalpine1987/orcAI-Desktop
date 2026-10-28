/** Transport helpers for spectrogram audio playback. */

export const DEFAULT_SKIP_SEC = 5;

/** HTMLMediaElement cannot reliably seek to exact `duration`. */
export const PLAYHEAD_END_EPS = 0.001;

export function clampPlayhead(sec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, Math.min(sec, durationSec));
}

export function playheadForFileEnd(durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, durationSec - PLAYHEAD_END_EPS);
}

export function resolvePlayheadSeek(
  sec: number,
  durationSec: number,
): { playhead: number; atStart: boolean; atEnd: boolean } {
  if (durationSec <= 0) {
    return { playhead: 0, atStart: true, atEnd: true };
  }
  if (sec <= PLAYHEAD_END_EPS) {
    return { playhead: 0, atStart: true, atEnd: false };
  }
  if (sec >= durationSec - PLAYHEAD_END_EPS) {
    return {
      playhead: playheadForFileEnd(durationSec),
      atStart: false,
      atEnd: true,
    };
  }
  return {
    playhead: clampPlayhead(sec, durationSec),
    atStart: false,
    atEnd: false,
  };
}

export function viewStartForPlayhead(
  playhead: number,
  viewStart: number,
  viewSpan: number,
  durationSec: number,
  atStart: boolean,
  atEnd: boolean,
): number {
  const span = Math.max(0.001, Math.min(viewSpan, durationSec));
  if (atStart) return 0;
  if (atEnd) return Math.max(0, durationSec - span);
  if (playhead < viewStart) {
    return Math.max(0, Math.min(playhead, durationSec - span));
  }
  const end = Math.min(durationSec, viewStart + span);
  if (playhead > end) {
    return Math.max(0, Math.min(playhead - span, durationSec - span));
  }
  return viewStart;
}

export function skipPlayhead(
  currentSec: number,
  deltaSec: number,
  durationSec: number,
): number {
  return clampPlayhead(currentSec + deltaSec, durationSec);
}

/** Clock for transport bar: `00:14.2` or `1:05:14.2`. */
export function formatPlayerClock(sec: number): string {
  const parts = splitPlayerClock(sec);
  if (parts.hours > 0) {
    return `${parts.hours}:${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}.${parts.tenths}`;
  }
  return `${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}.${parts.tenths}`;
}

/** m04 Results LCD: `04:47` or `1:05:14` (no tenths). */
export function formatStudioLcdClock(sec: number): string {
  const parts = splitPlayerClock(sec);
  if (parts.hours > 0) {
    return `${parts.hours}:${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}`;
  }
  return `${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}`;
}

/** Broken-out clock fields for Logic-style LCD cells. */
export function splitPlayerClock(sec: number): {
  hours: number;
  minutes: number;
  seconds: number;
  tenths: number;
} {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalTenths = Math.round(clamped * 10);
  return {
    hours: Math.floor(totalTenths / 36000),
    minutes: Math.floor((totalTenths % 36000) / 600),
    seconds: Math.floor((totalTenths % 600) / 10),
    tenths: totalTenths % 10,
  };
}
