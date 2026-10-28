import { describe, expect, it, beforeEach } from "vitest";
import {
  collapsedAfterEdgeDrag,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "./sidebarCollapse";

describe("sidebarCollapse", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists collapsed flag", () => {
    expect(loadSidebarCollapsed()).toBe(false);
    saveSidebarCollapsed(true);
    expect(loadSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it("maps edge drag past threshold", () => {
    expect(
      collapsedAfterEdgeDrag({ wasCollapsed: false, deltaX: -50 }),
    ).toBe(true);
    expect(
      collapsedAfterEdgeDrag({ wasCollapsed: true, deltaX: 50 }),
    ).toBe(false);
    expect(
      collapsedAfterEdgeDrag({ wasCollapsed: false, deltaX: -10 }),
    ).toBe(false);
  });
});
