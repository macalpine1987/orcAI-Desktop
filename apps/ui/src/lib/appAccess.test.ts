import { describe, expect, it } from "vitest";
import {
  canAccessWorkSections,
  isRuntimeFreePath,
  normalizeAppPath,
} from "./appAccess";

describe("appAccess", () => {
  it("normalizes paths", () => {
    expect(normalizeAppPath("/projects/")).toBe("/projects");
    expect(normalizeAppPath("/")).toBe("/");
  });

  it("allows free paths", () => {
    expect(isRuntimeFreePath("/")).toBe(true);
    expect(isRuntimeFreePath("/settings")).toBe(true);
    expect(isRuntimeFreePath("/help")).toBe(true);
    expect(isRuntimeFreePath("/projects")).toBe(false);
    expect(isRuntimeFreePath("/predict")).toBe(false);
  });

  it("grants work sections when engine ready", () => {
    expect(canAccessWorkSections(true, false)).toBe(true);
  });

  it("grants work sections during CPU/GPU restart grace", () => {
    expect(canAccessWorkSections(false, true)).toBe(true);
  });

  it("blocks work sections when idle", () => {
    expect(canAccessWorkSections(false, false)).toBe(false);
  });
});
