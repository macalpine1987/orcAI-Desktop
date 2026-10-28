import { describe, expect, it } from "vitest";
import {
  clampInspectorWidth,
  clampLabDockHeightPx,
  DEFAULT_INSPECTOR_WIDTH,
  maxInspectorWidthForContainer,
  MAX_STORED_INSPECTOR_WIDTH,
  MIN_INSPECTOR_WIDTH,
  MIN_LOG_WIDTH,
  parseStoredInspectorWidth,
  RESIZE_HANDLE_WIDTH,
} from "./labDockLayout";

describe("parseStoredInspectorWidth", () => {
  it("returns default for empty input", () => {
    expect(parseStoredInspectorWidth(null)).toBe(DEFAULT_INSPECTOR_WIDTH);
  });

  it("clamps stored value to allowed range", () => {
    expect(parseStoredInspectorWidth("100")).toBe(MIN_INSPECTOR_WIDTH);
    expect(parseStoredInspectorWidth("9999")).toBe(MAX_STORED_INSPECTOR_WIDTH);
    expect(parseStoredInspectorWidth("400")).toBe(400);
  });

  it("rejects non-numeric values", () => {
    expect(parseStoredInspectorWidth("abc", 280)).toBe(280);
  });
});

describe("clampLabDockHeightPx", () => {
  it("uses the 17.5rem ceiling at the default 800px shell", () => {
    expect(clampLabDockHeightPx(800)).toBe(17.5 * 14);
  });

  it("tracks 38% of a short shell until the 10rem floor", () => {
    expect(clampLabDockHeightPx(500)).toBe(190);
    expect(clampLabDockHeightPx(300)).toBe(10 * 14);
  });

  it("never exceeds 17.5rem on a tall / fullscreen shell", () => {
    expect(clampLabDockHeightPx(1080)).toBe(17.5 * 14);
  });
});

describe("maxInspectorWidthForContainer", () => {
  it("matches clamp upper bound for known container", () => {
    const container = 800;
    const max = maxInspectorWidthForContainer(container);
    expect(clampInspectorWidth(max + 100, container)).toBe(max);
  });
});

describe("clampInspectorWidth", () => {
  it("respects container minus log minimum and handle", () => {
    const container = 800;
    const max =
      container - MIN_LOG_WIDTH - RESIZE_HANDLE_WIDTH;
    expect(clampInspectorWidth(900, container)).toBe(max);
    expect(clampInspectorWidth(250, container)).toBe(250);
  });

  it("uses stored max when container width unknown", () => {
    expect(clampInspectorWidth(900, 0)).toBe(MAX_STORED_INSPECTOR_WIDTH);
  });

  it("never goes below minimum inspector width", () => {
    expect(clampInspectorWidth(50, 1000)).toBe(MIN_INSPECTOR_WIDTH);
  });

  it("handles narrow containers", () => {
    const narrow = MIN_LOG_WIDTH + RESIZE_HANDLE_WIDTH + MIN_INSPECTOR_WIDTH;
    expect(clampInspectorWidth(500, narrow)).toBe(MIN_INSPECTOR_WIDTH);
  });
});
