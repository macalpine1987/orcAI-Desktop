/** Home · recent jobs: how many rows to show for the current dock / height. */

export const HOME_RECENT_JOBS_MIN = 4;
/** Hard cap for Home «Recent jobs» (grows with window / fullscreen height up to this). */
export const HOME_RECENT_JOBS_MAX = 14;

/**
 * Upper bound for the Home list (was a fixed 4 on m01).
 * Visible count adapts via {@link homeRecentJobsVisibleCount}.
 */
export const HOME_RECENT_JOBS_LIMIT = HOME_RECENT_JOBS_MAX;

const DEFAULT_ROW_PX = 34;
const DEFAULT_HEAD_PX = 28;

/**
 * Fit rows to the panel height for both dock states (QA-L1: no dual-mode).
 * ``dockCollapsed`` is kept for call-site compatibility; height fit always applies.
 */
export function homeRecentJobsVisibleCount(opts: {
  panelHeightPx: number;
  dockCollapsed: boolean;
  jobCount: number;
  rowHeightPx?: number;
  headHeightPx?: number;
}): number {
  const jobCount = Math.max(0, Math.floor(opts.jobCount));
  if (jobCount === 0) return 0;

  const rowH = opts.rowHeightPx ?? DEFAULT_ROW_PX;
  const headH = opts.headHeightPx ?? DEFAULT_HEAD_PX;
  const h = opts.panelHeightPx;
  if (!(h > 0) || !(rowH > 0)) {
    return Math.min(HOME_RECENT_JOBS_MIN, jobCount);
  }

  const fit = Math.floor((h - headH) / rowH);
  // Never request more rows than physically fit (avoids nested overflow / dual scroll).
  if (fit < 1) {
    return Math.min(1, jobCount);
  }
  return Math.min(HOME_RECENT_JOBS_MAX, jobCount, fit);
}
