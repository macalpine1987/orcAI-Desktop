import { describe, expect, it } from "vitest";
import { labelBandLayout } from "./labelBandLayout";
import { hitOverlaySegment } from "./spectrogramOverlayHit";

describe("hitOverlaySegment", () => {
  const names = ["whistles", "buzzing"];

  it("picks the class lane under the cursor when two marks share time", () => {
    const whistle = { id: "w" };
    const buzz = { id: "b" };
    const items = [
      { seg: whistle, label: "whistles", t0: 1, t1: 3 },
      { seg: buzz, label: "buzzing", t0: 1.2, t1: 2.8 },
    ];
    const h = 200;
    const xFrac = 2 / 10;
    const wBand = labelBandLayout("whistles", names, h);
    const bBand = labelBandLayout("buzzing", names, h);
    expect(
      hitOverlaySegment(items, {
        xFrac,
        yPx: wBand.y + wBand.bandHeight / 2,
        heightPx: h,
        viewStart: 0,
        viewSpan: 10,
        labelNames: names,
      }),
    ).toEqual(whistle);
    expect(
      hitOverlaySegment(items, {
        xFrac,
        yPx: bBand.y + bBand.bandHeight / 2,
        heightPx: h,
        viewStart: 0,
        viewSpan: 10,
        labelNames: names,
      }),
    ).toEqual(buzz);
  });

  it("prefers the shorter overlapping mark of the same class", () => {
    const wide = { id: "wide" };
    const nested = { id: "nested" };
    const items = [
      { seg: wide, label: "whistles", t0: 0, t1: 10 },
      { seg: nested, label: "whistles", t0: 4.8, t1: 5.2 },
    ];
    const hit = hitOverlaySegment(items, {
      xFrac: 0.5,
      yPx: 30,
      heightPx: 200,
      viewStart: 0,
      viewSpan: 10,
      labelNames: names,
    });
    expect(hit).toEqual(nested);
  });
});
