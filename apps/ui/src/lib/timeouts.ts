/**
 * Shared client timeout ceilings (ms). Single source for long-running
 * fetch/tile and job/import waits — re-export from call-site modules.
 */

/** Short sidecar HTTP (list/get/cancel/exists). */
export const SIDECAR_HTTP_SHORT_MS = 5_000;

/** Medium sidecar HTTP (predict create, model detail, filter preview). */
export const SIDECAR_HTTP_MEDIUM_MS = 8_000;

/** Slightly longer medium (model detail / compatibility peers that used 10s). */
export const SIDECAR_HTTP_MEDIUM_LONG_MS = 10_000;

/** Filter-predictions preview (histogram sampling can exceed medium). */
export const SIDECAR_HTTP_PREVIEW_MS = 30_000;

/** CLI / copy toast “copied” feedback duration. */
export const COPY_FEEDBACK_MS = 1600;

/** Longest UI call (spectrogram tile / sidecar fetch) plus a little room. */
export const SIDECAR_FETCH_TIMEOUT_MS = 300_000;

/** Alias — same ceiling as sidecar fetch for tile downloads. */
export const TILE_FETCH_TIMEOUT_MS = SIDECAR_FETCH_TIMEOUT_MS;

/** Default wait for job terminal status and project audio import jobs. */
export const DEFAULT_JOB_TIMEOUT_MS = 30 * 60 * 1000;

/** Alias for import-audio wait (same 30 min default). */
export const DEFAULT_IMPORT_JOB_TIMEOUT_MS = DEFAULT_JOB_TIMEOUT_MS;
