import { describe, expect, it } from "vitest";
import {
  completedEpochCount,
  finiteSeries,
  historySeries,
  isValStagnant,
  trainMetricKey,
} from "../trainMonitor/MetricChart";

describe("MetricChart series helpers", () => {
  it("maps val_* monitor to train metric key", () => {
    expect(trainMetricKey("val_MBA")).toBe("MBA");
    expect(trainMetricKey("val_mAP")).toBe("mAP");
    expect(trainMetricKey("MBA")).toBe("MBA");
  });

  it("resolves history case-insensitively", () => {
    const hist = { mba: [0.1, 0.2], val_MBA: [0.15, 0.25] };
    expect(historySeries(hist, "MBA")).toEqual([0.1, 0.2]);
    expect(historySeries(hist, "val_MBA")).toEqual([0.15, 0.25]);
    expect(historySeries(hist, "missing")).toEqual([]);
  });

  it("finiteSeries drops non-finite samples", () => {
    expect(finiteSeries([0.1, Number.NaN, 0.2, Infinity, 0.3])).toEqual([
      0.1, 0.2, 0.3,
    ]);
  });

  it("completedEpochCount ignores provisional length (X-axis finished epochs only)", () => {
    expect(completedEpochCount([0.6], [0.55])).toBe(1);
    expect(completedEpochCount([0.6, 0.7], [0.55])).toBe(2);
    expect(completedEpochCount([], [])).toBe(0);
  });

  it("isValStagnant detects flat validation", () => {
    expect(isValStagnant([0.55])).toBe(false);
    expect(isValStagnant([0.5532, 0.5532])).toBe(true);
    expect(isValStagnant([0.55, 0.62])).toBe(false);
  });
});
