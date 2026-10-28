import { describe, expect, it } from "vitest";
import {
  defaultDockCollapsed,
  dockModeFromCollapsed,
  resolveUiScaleFactor,
  uiScaleFactorToPreset,
} from "./interfaceSettings";

describe("interfaceSettings · ", () => {
  it("resolveUiScaleFactor maps presets", () => {
    expect(resolveUiScaleFactor("100")).toBe(1);
    expect(resolveUiScaleFactor("125")).toBe(1.25);
  });

  it("uiScaleFactorToPreset round-trips numeric factors", () => {
    expect(uiScaleFactorToPreset(1.25)).toBe("125");
    expect(uiScaleFactorToPreset(1.5)).toBe("125");
    expect(uiScaleFactorToPreset(1)).toBe("100");
  });

  it("default dock mode helpers", () => {
    expect(defaultDockCollapsed("collapsed")).toBe(true);
    expect(defaultDockCollapsed("expanded")).toBe(false);
    expect(dockModeFromCollapsed(true)).toBe("collapsed");
    expect(dockModeFromCollapsed(false)).toBe("expanded");
  });
});
