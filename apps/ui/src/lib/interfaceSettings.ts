/** · interface preferences (persisted in preferences storage). */

export type UiScalePreset = "100" | "125";

export type DefaultDockMode = "collapsed" | "expanded";

export const UI_SCALE_PRESETS: UiScalePreset[] = ["100", "125"];

const NUMERIC_SCALE: Record<UiScalePreset, number> = {
  "100": 1,
  "125": 1.25,
};

/** Logical UI scale factor for CSS zoom (NFR-17). */
export function resolveUiScaleFactor(preset: UiScalePreset): number {
  return NUMERIC_SCALE[preset];
}

export function uiScaleFactorToPreset(factor: number): UiScalePreset {
  if (Math.abs(factor - 1.25) < 1e-6) return "125";
  // Retired 150% preset: keep the larger of the two remaining steps.
  if (Math.abs(factor - 1.5) < 1e-6) return "125";
  return "100";
}

export function defaultDockCollapsed(mode: DefaultDockMode): boolean {
  return mode === "collapsed";
}

export function dockModeFromCollapsed(collapsed: boolean): DefaultDockMode {
  return collapsed ? "collapsed" : "expanded";
}
