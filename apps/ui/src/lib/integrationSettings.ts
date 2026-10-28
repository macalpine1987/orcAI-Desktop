/** · runtime + paths preferences (persisted with interface settings). */

export type LogVerbosity = 0 | 1 | 2 | 3;

export const LOG_VERBOSITY_LEVELS: LogVerbosity[] = [0, 1, 2, 3];

export const DEFAULT_LOG_VERBOSITY: LogVerbosity = 2;

export function resolveLogVerbosity(raw: unknown): LogVerbosity {
  const value = Number(raw);
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  return DEFAULT_LOG_VERBOSITY;
}

let liveVerbosity: LogVerbosity = DEFAULT_LOG_VERBOSITY;

/** Last Settings `-v` (injected into new jobs that omit verbosity). */
export function setLiveLogVerbosity(level: LogVerbosity): void {
  liveVerbosity = resolveLogVerbosity(level);
}

export function liveLogVerbosity(): LogVerbosity {
  return liveVerbosity;
}

export function withJobVerbosity(
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (params.verbosity !== undefined && params.verbosity !== null) return params;
  return { ...params, verbosity: liveVerbosity };
}

/** Match sidecar ``FULL_FILE_SPECTROGRAM_MAX_SEC``. */
export const LARGE_WAV_FULL_STFT_MAX_SEC = 20 * 60;

let liveLargeWavFlag = false;

/** Settings: windowed STFT + skip full prefetch of long neighbor WAVs. Default off. */
export function setLiveLargeWavOptimize(enabled: boolean): void {
  liveLargeWavFlag = Boolean(enabled);
}

export function liveLargeWavOptimize(): boolean {
  return liveLargeWavFlag;
}

export function shouldWarmFullSpectrogram(
  durationSec: number,
  optimize: boolean = liveLargeWavFlag,
): boolean {
  if (!optimize) return true;
  return durationSec <= LARGE_WAV_FULL_STFT_MAX_SEC;
}
