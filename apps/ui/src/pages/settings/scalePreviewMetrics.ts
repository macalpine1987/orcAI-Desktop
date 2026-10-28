import { resolveUiScaleFactor, type UiScalePreset } from "../../lib/interfaceSettings";
import type { DefaultDockMode } from "../../preferences/PreferencesContext";

/** m28 design reference (NFR-17 logical canvas). */
export const SCALE_PREVIEW_LOGICAL_WIDTH = 1280;
export const SCALE_PREVIEW_LOGICAL_HEIGHT = 800;
export const SCALE_PREVIEW_SIDEBAR_PX = 240;
export const SCALE_PREVIEW_DOCK_COLLAPSED_PX = 38;
export const SCALE_PREVIEW_DOCK_EXPANDED_PX = 280;

export type ScalePreviewMetrics = {
  factor: number;
  pct: number;
  effectiveWidth: number;
  effectiveHeight: number;
  sidebarPx: number;
  dockHeightPx: number;
  dockCollapsed: boolean;
};

export function computeScalePreviewMetrics(
  preset: UiScalePreset,
  dockMode: DefaultDockMode,
): ScalePreviewMetrics {
  const factor = resolveUiScaleFactor(preset);
  const dockCollapsed = dockMode === "collapsed";
  return {
    factor,
    pct: Math.round(factor * 100),
    effectiveWidth: Math.round(SCALE_PREVIEW_LOGICAL_WIDTH / factor),
    effectiveHeight: Math.round(SCALE_PREVIEW_LOGICAL_HEIGHT / factor),
    sidebarPx: SCALE_PREVIEW_SIDEBAR_PX,
    dockHeightPx: dockCollapsed
      ? SCALE_PREVIEW_DOCK_COLLAPSED_PX
      : SCALE_PREVIEW_DOCK_EXPANDED_PX,
    dockCollapsed,
  };
}

/** Nav rows shown in the mini wireframe (Jobs studio as reference screen). */
export const SCALE_PREVIEW_NAV_IDS = [
  "home",
  "projects",
  "predict",
  "jobs",
  "settings",
  "help",
] as const;

export type ScalePreviewNavId = (typeof SCALE_PREVIEW_NAV_IDS)[number];
