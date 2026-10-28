import { describe, expect, it } from "vitest";
import {
  spectrogramTileNeedsViewTransform,
  spectrogramTilePanPx,
  spectrogramTileViewTransform,
} from "./spectrogramTilePan";

describe("spectrogramTileViewTransform", () => {
  it("pans without scale when span matches", () => {
    const t = spectrogramTileViewTransform({
      viewStart: 90,
      visibleSpan: 40,
      loadedT0: 80,
      loadedT1: 120,
      plotWidthPx: 400,
    });
    expect(t.scaleX).toBeCloseTo(1, 5);
    expect(t.widthPercent).toBeCloseTo(100, 5);
    expect(t.marginLeftPercent).toBeCloseTo(-25, 5);
    expect(t.translateXPx).toBeCloseTo(-100, 5);
  });

  it("scales in when live view is narrower than the loaded tile", () => {
    // Loaded 0–40 s; live view 10–30 s (20 s) → 2× width, −50% margin.
    const t = spectrogramTileViewTransform({
      viewStart: 10,
      visibleSpan: 20,
      loadedT0: 0,
      loadedT1: 40,
      plotWidthPx: 400,
    });
    expect(t.scaleX).toBeCloseTo(2, 5);
    expect(t.widthPercent).toBeCloseTo(200, 5);
    expect(t.marginLeftPercent).toBeCloseTo(-50, 5);
    expect(t.translateXPx).toBeCloseTo(-200, 5);
  });

  it("scales out when live view is wider than the loaded tile", () => {
    const t = spectrogramTileViewTransform({
      viewStart: 0,
      visibleSpan: 200,
      loadedT0: 0,
      loadedT1: 40,
      plotWidthPx: 400,
    });
    expect(t.scaleX).toBeCloseTo(0.2, 5);
    expect(t.widthPercent).toBeCloseTo(20, 5);
    expect(t.marginLeftPercent).toBeCloseTo(0, 5);
    expect(t.translateXPx).toBeCloseTo(0, 5);
  });
});

describe("spectrogramTilePanPx", () => {
  it("returns 0 when span differs (use view transform for zoom)", () => {
    expect(
      spectrogramTilePanPx({
        viewStart: 10,
        visibleSpan: 20,
        loadedT0: 0,
        loadedT1: 40,
        plotWidthPx: 800,
      }),
    ).toBe(0);
  });

  it("shifts left when view moved forward in time", () => {
    expect(
      spectrogramTilePanPx({
        viewStart: 90,
        visibleSpan: 40,
        loadedT0: 80,
        loadedT1: 120,
        plotWidthPx: 400,
      }),
    ).toBeCloseTo(-100, 5);
  });
});

describe("spectrogramTileNeedsViewTransform", () => {
  it("detects identity", () => {
    expect(
      spectrogramTileNeedsViewTransform({
        widthPercent: 100,
        marginLeftPercent: 0,
        scaleX: 1,
        translateXPx: 0,
      }),
    ).toBe(false);
    expect(
      spectrogramTileNeedsViewTransform({
        widthPercent: 100,
        marginLeftPercent: 3,
        scaleX: 1,
        translateXPx: 12,
      }),
    ).toBe(true);
  });
});
