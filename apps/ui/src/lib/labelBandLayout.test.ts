import { describe, expect, it } from "vitest";
import { labelBandLayout } from "./labelBandLayout";
import { PUBLICATION_LABEL_ORDER } from "./labelColors";

describe("labelBandLayout", () => {
  it("places classes at different vertical positions", () => {
    const h = 280;
    const a = labelBandLayout("breathing", PUBLICATION_LABEL_ORDER, h);
    const b = labelBandLayout("whistles", PUBLICATION_LABEL_ORDER, h);
    expect(a.y).not.toBeCloseTo(b.y, 0);
    expect(a.bandHeight).toBeGreaterThan(10);
  });

  it("shrinks lanes so they fit a short spectrogram without overlapping", () => {
    const labels = PUBLICATION_LABEL_ORDER.slice(0, 7);
    const h = 90;
    const bands = labels.map((l) => labelBandLayout(l, labels, h));
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].y + bands[i].bandHeight).toBeLessThanOrEqual(
        bands[i + 1].y + 0.51,
      );
    }
  });
});
