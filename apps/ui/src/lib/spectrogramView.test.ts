import { describe, expect, it } from "vitest";
import {
  SPECTROGRAM_SEGMENT_SEC,
  quantizeSpectrogramTileWindow,
  spectrogramNeighborTileWindows,
  spectrogramSegmentCount,
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
  spectrogramTilePixelWidth,
  spectrogramViewNearTileEdge,
  spectrogramViewNeedsTileRefresh,
} from "./spectrogramView";

describe("spectrogramSegmentWindow", () => {
  it("uses 200 s segments", () => {
    expect(SPECTROGRAM_SEGMENT_SEC).toBe(200);
    const w = spectrogramSegmentWindow(1, 450);
    expect(w.viewStart).toBe(200);
    expect(w.viewSpan).toBe(200);
    expect(w.segmentTotal).toBe(3);
  });

  it("shortens last segment", () => {
    const w = spectrogramSegmentWindow(2, 450);
    expect(w.viewStart).toBe(400);
    expect(w.viewSpan).toBe(50);
  });

  it("segment count is at least 1", () => {
    expect(spectrogramSegmentCount(0)).toBe(1);
    expect(spectrogramSegmentCount(10)).toBe(1);
    expect(spectrogramSegmentCount(200)).toBe(1);
  });

  it("folds a leftover shorter than the minimum useful window", () => {
    // 03:20 displayed (floor) is often 200.0x s — must not become 1/2.
    expect(spectrogramSegmentCount(200.04)).toBe(1);
    expect(spectrogramSegmentCount(200.5)).toBe(1);
    expect(spectrogramSegmentCount(201.9)).toBe(1);
    const folded = spectrogramSegmentWindow(0, 200.5);
    expect(folded.segmentTotal).toBe(1);
    expect(folded.viewStart).toBe(0);
    expect(folded.viewSpan).toBeCloseTo(200.5, 5);
    expect(spectrogramSegmentWindow(1, 200.5).segmentIndex).toBe(0);
  });

  it("keeps a leftover that can fill a real page", () => {
    expect(spectrogramSegmentCount(202)).toBe(2);
    const last = spectrogramSegmentWindow(1, 202);
    expect(last.viewStart).toBe(200);
    expect(last.viewSpan).toBeCloseTo(2, 5);
  });

  it("absorbs a tiny tail into the last full pages of a long file", () => {
    expect(spectrogramSegmentCount(400.5)).toBe(2);
    const last = spectrogramSegmentWindow(1, 400.5);
    expect(last.viewStart).toBe(200);
    expect(last.viewSpan).toBeCloseTo(200.5, 5);
  });

  it("maps view start to segment index", () => {
    expect(spectrogramSegmentIndexForStart(0, 500)).toBe(0);
    expect(spectrogramSegmentIndexForStart(199, 500)).toBe(0);
    expect(spectrogramSegmentIndexForStart(200, 500)).toBe(1);
  });
});

describe("quantizeSpectrogramTileWindow", () => {
  it("snaps span to quantum and keeps window inside the file", () => {
    const q = quantizeSpectrogramTileWindow(10.11, 33.4, 200, 0.25);
    expect(q.t1 - q.t0).toBeCloseTo(23.25, 5);
    expect(q.t0).toBeGreaterThanOrEqual(0);
    expect(q.t1).toBeLessThanOrEqual(200);
  });

  it("respects minimum view span", () => {
    const q = quantizeSpectrogramTileWindow(5, 5.5, 100, 0.25);
    expect(q.t1 - q.t0).toBeGreaterThanOrEqual(2);
  });
});

describe("spectrogramTileOverscanWindow", () => {
  it("pads the live view on both sides", () => {
    const w = spectrogramTileOverscanWindow(40, 60, 200, 0.75);
    expect(w.t0).toBeLessThan(40);
    expect(w.t1).toBeGreaterThan(60);
    expect(w.t1 - w.t0).toBeGreaterThan(20);
  });

  it("clamps to file bounds", () => {
    const w = spectrogramTileOverscanWindow(0, 20, 100, 0.75);
    expect(w.t0).toBe(0);
    expect(w.t1).toBeGreaterThan(20);
  });
});

describe("spectrogramViewNeedsTileRefresh", () => {
  it("is false while comfortably inside the tile", () => {
    expect(
      spectrogramViewNeedsTileRefresh(40, 60, { t0: 20, t1: 80 }, 0.2),
    ).toBe(false);
  });

  it("is false near the soft edge (prefetch only — no display swap)", () => {
    expect(
      spectrogramViewNeedsTileRefresh(22, 42, { t0: 20, t1: 80 }, 0.2),
    ).toBe(false);
  });

  it("is true when view leaves the tile", () => {
    expect(
      spectrogramViewNeedsTileRefresh(90, 110, { t0: 20, t1: 80 }, 0.2),
    ).toBe(true);
  });
});

describe("spectrogramViewNearTileEdge", () => {
  it("is true near soft edge while still covered", () => {
    expect(
      spectrogramViewNearTileEdge(22, 42, { t0: 20, t1: 80 }, 0.2),
    ).toBe(true);
  });

  it("is false in the comfortable center", () => {
    expect(
      spectrogramViewNearTileEdge(40, 60, { t0: 20, t1: 80 }, 0.2),
    ).toBe(false);
  });

  it("is false once the view leaves the tile", () => {
    expect(
      spectrogramViewNearTileEdge(90, 110, { t0: 20, t1: 80 }, 0.2),
    ).toBe(false);
  });
});

describe("spectrogramTilePixelWidth", () => {
  it("scales width with overscan span", () => {
    expect(spectrogramTilePixelWidth(400, 0, 50, 20)).toBe(1000);
  });

  it("caps at max width", () => {
    expect(spectrogramTilePixelWidth(2000, 0, 100, 10, 4096)).toBe(4096);
  });
});

describe("spectrogramNeighborTileWindows", () => {
  it("returns left and right windows", () => {
    const [left, right] = spectrogramNeighborTileWindows(
      { t0: 40, t1: 80 },
      200,
    );
    expect(left.t1).toBeLessThanOrEqual(40 + 1e-6);
    expect(right.t0).toBeGreaterThanOrEqual(80 - 1e-6);
  });
});
