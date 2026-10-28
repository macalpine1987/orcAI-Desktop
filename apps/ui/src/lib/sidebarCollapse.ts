const STORAGE_KEY = "orcai.shell.sidebarCollapsed";

export const SIDEBAR_COLLAPSE_DRAG_PX = 40;

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* private mode / unavailable */
  }
}

/** Map horizontal drag on the edge grip to a collapsed preference. */
export function collapsedAfterEdgeDrag(opts: {
  wasCollapsed: boolean;
  deltaX: number;
  thresholdPx?: number;
}): boolean {
  const threshold = opts.thresholdPx ?? SIDEBAR_COLLAPSE_DRAG_PX;
  if (Math.abs(opts.deltaX) < threshold) return opts.wasCollapsed;
  // Drag left → collapse; drag right → expand
  return opts.deltaX < 0;
}
