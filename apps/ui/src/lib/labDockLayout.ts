export const LAB_DOCK_INSPECTOR_WIDTH_KEY = "orcai-desktop.labInspectorWidth";
export const DEFAULT_INSPECTOR_WIDTH = 320;
export const MIN_INSPECTOR_WIDTH = 200;
export const MIN_LOG_WIDTH = 200;
export const RESIZE_HANDLE_WIDTH = 6;
export const MAX_STORED_INSPECTOR_WIDTH = 720;
/** Expanded lab dock height (m16). CSS: clamp(10rem, 38cqh, 17.5rem). */
export const LAB_DOCK_PANEL_HEIGHT_CLASS = "lab-dock-panel-m16";
export const LAB_DOCK_HEIGHT_MIN_REM = 10;
export const LAB_DOCK_HEIGHT_MAX_REM = 17.5;
export const LAB_DOCK_HEIGHT_CQH_FRACTION = 0.38;
/** html { font-size: 14px } — rem used by --m16-dock-h. */
export const LAB_UI_ROOT_FONT_PX = 14;

/** Matches `.app-viewport { --m16-dock-h: clamp(10rem, 38cqh, 17.5rem) }`. */
export function clampLabDockHeightPx(
  containerHeightPx: number,
  remPx = LAB_UI_ROOT_FONT_PX,
): number {
  const min = LAB_DOCK_HEIGHT_MIN_REM * remPx;
  const max = LAB_DOCK_HEIGHT_MAX_REM * remPx;
  const preferred = Math.max(0, containerHeightPx) * LAB_DOCK_HEIGHT_CQH_FRACTION;
  return Math.min(max, Math.max(min, preferred));
}

export function parseStoredInspectorWidth(
  raw: string | null,
  fallback = DEFAULT_INSPECTOR_WIDTH,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(
    MIN_INSPECTOR_WIDTH,
    Math.min(MAX_STORED_INSPECTOR_WIDTH, n),
  );
}

export function maxInspectorWidthForContainer(containerWidthPx: number): number {
  if (containerWidthPx <= 0) return MAX_STORED_INSPECTOR_WIDTH;
  return Math.max(
    MIN_INSPECTOR_WIDTH,
    containerWidthPx - MIN_LOG_WIDTH - RESIZE_HANDLE_WIDTH,
  );
}

export function clampInspectorWidth(
  next: number,
  containerWidthPx: number,
): number {
  const max = maxInspectorWidthForContainer(containerWidthPx);
  return Math.max(MIN_INSPECTOR_WIDTH, Math.min(max, next));
}
