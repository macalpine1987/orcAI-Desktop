/**
 * Named UI poll intervals (ms). Values match pre-centralization call sites —
 * change here only when intentionally retuning cadence.
 */

/** Pipeline board: idle refresh while no wizard/pipeline work. */
export const PIPELINE_POLL_IDLE_MS = 2000;
/** Pipeline board: faster refresh while pipeline or wizard plan is busy. */
export const PIPELINE_POLL_BUSY_MS = 750;

/** Train monitor snapshot: while training job is live. */
export const TRAIN_MONITOR_POLL_BUSY_MS = 1000;
/** Train monitor snapshot: when idle / not live. */
export const TRAIN_MONITOR_POLL_IDLE_MS = 3000;

/** Train monitor job-log tail: while training job is live. */
export const TRAIN_MONITOR_LOG_POLL_BUSY_MS = 1500;
/** Train monitor job-log tail: when idle / not live. */
export const TRAIN_MONITOR_LOG_POLL_IDLE_MS = 4000;

/** Project summary refresh on Home / banners. */
export const PROJECT_SUMMARY_POLL_MS = 8000;

/**
 * Sidecar health while booting / busy. Keep in sync with runtime contract
 * (`BOOT_POLL_MS = 750` is re-exported from useSidecarHealthPolling).
 */
export const HEALTH_POLL_BUSY_MS = 750;
/** Sidecar health when online and idle. */
export const HEALTH_POLL_IDLE_MS = 3000;

/** Home wizard plan rail: while plan steps are busy. */
export const HOME_WIZARD_POLL_BUSY_MS = 2_000;
/** Home wizard plan rail: idle refresh. */
export const HOME_WIZARD_POLL_IDLE_MS = 8_000;

/** Projects studio refresh while page is open. */
export const PROJECT_STUDIO_POLL_MS = 12_000;

/** Workspace reconcile while Sidecar is online. */
export const WORKSPACE_RECONCILE_POLL_MS = 12_000;

/** Jobs list idle poll (active jobs use the same cadence as a safety net). */
export const JOBS_LIST_POLL_MS = 5_000;
