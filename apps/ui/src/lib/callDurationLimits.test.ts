import { describe, expect, it } from "vitest";
import {
  boundToInput,
  collapseNoOpClassLimits,
  durationHistogram,
  durationFromPlotX,
  boundsFromBrush,
  snapDuration,
  filteredOutputPath,
  resolveFilterJobOutputPath,
  inputToBound,
  isDurationBoundDraft,
  isNoOpDurationLimits,
  ORCAI_DEFAULT_DURATION_LIMITS,
  ORCAI_V1_PUBLICATION_LIMITS,
  parseLimitsJson,
  serializeLimitsJson,
} from "./callDurationLimits";

describe("callDurationLimits", () => {
  it("keeps sparse JSON so orcAI can fall back to default for missing classes", () => {
    const limits = parseLimitsJson(
      JSON.stringify({ default: [1, null], WHISTLE: [0.1, null] }),
    );
    expect(limits.WHISTLE).toEqual([0.1, null]);
    expect(limits.BR).toBeUndefined();
    const blob = serializeLimitsJson(limits);
    expect(blob).not.toContain("BR");
    expect(blob).toContain('"default"');
  });

  it("parses empty max as null and does not coerce empty min to 0", () => {
    const limits = parseLimitsJson(
      JSON.stringify({ default: [0, null], WHISTLE: [0.1, null] }),
    );
    expect(limits.WHISTLE).toEqual([0.1, null]);
    expect(serializeLimitsJson(limits)).toContain('"WHISTLE"');
    expect(serializeLimitsJson(limits)).toMatch(/null/);
    expect(inputToBound("")).toBeNull();
    expect(inputToBound("0.4")).toBe(0.4);
    expect(inputToBound("0,06")).toBe(0.06);
    expect(inputToBound("0.")).toBe(0);
    expect(boundToInput(null)).toBe("");
    expect(boundToInput(0)).toBe("0");
    expect(isDurationBoundDraft("0.")).toBe(true);
    expect(isDurationBoundDraft("0,")).toBe(true);
    expect(isDurationBoundDraft("0.06")).toBe(true);
    expect(isDurationBoundDraft("0,06")).toBe(true);
    expect(isDurationBoundDraft("1.2.3")).toBe(false);
  });

  it("flags the bundled default as a no-op filter", () => {
    expect(isNoOpDurationLimits(ORCAI_DEFAULT_DURATION_LIMITS)).toBe(true);
    expect(isNoOpDurationLimits(ORCAI_V1_PUBLICATION_LIMITS)).toBe(false);
    expect("WHISTLE" in ORCAI_DEFAULT_DURATION_LIMITS).toBe(false);
  });

  it("drops engine-shaped [0, null] class rows so default is not shadowed", () => {
    const collapsed = collapseNoOpClassLimits({
      default: [0, null],
      WHISTLE: [0, null],
      BR: [0, null],
    });
    expect(collapsed).toEqual({ default: [0, null] });
    expect(serializeLimitsJson(collapsed)).not.toContain("WHISTLE");
    const override = collapseNoOpClassLimits({
      default: [0.1, null],
      WHISTLE: [0, null],
    });
    expect(override.WHISTLE).toEqual([0, null]);
    expect(serializeLimitsJson(override)).toContain("WHISTLE");
  });

  it("builds *_predicted_filtered.txt next to the source", () => {
    expect(filteredOutputPath("/p/a_c1_orcai-isl-v1_predicted.txt")).toBe(
      "/p/a_c1_orcai-isl-v1_predicted_filtered.txt",
    );
    expect(
      resolveFilterJobOutputPath(
        "/p/a_c1_orcai-isl-v1_predicted.txt",
        "default",
      ),
    ).toBe("/p/a_c1_orcai-isl-v1_predicted_filtered.txt");
    expect(
      resolveFilterJobOutputPath(
        "/p/a_c1_orcai-isl-v1_predicted.txt",
        "/out/custom_filtered.txt",
      ),
    ).toBe("/out/custom_filtered.txt");
  });

  it("serializes empty min as JSON null, not 0", () => {
    const blob = serializeLimitsJson({
      default: [null, null],
      WHISTLE: [null, 12],
    });
    const parsed = JSON.parse(blob) as Record<string, [number | null, number | null]>;
    expect(parsed.WHISTLE[0]).toBeNull();
    expect(parsed.WHISTLE[1]).toBe(12);
    expect(parsed.default[0]).toBeNull();
    expect(blob).not.toMatch(/"WHISTLE":\s*\[\s*0,/);
  });

  it("bins durations for the histogram", () => {
    const bins = durationHistogram([0.1, 0.2, 1.5], 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3);
  });

  it("maps a histogram brush to min/max, leaving max open at the right edge", () => {
    expect(boundsFromBrush(0.4, 12, 20)).toEqual([0.4, 12]);
    expect(boundsFromBrush(12, 0.4, 20)).toEqual([0.4, 12]);
    expect(boundsFromBrush(0.4, 19.7, 20)[1]).toBeNull();
    expect(snapDuration(0.07)).toBe(0.07);
    expect(durationFromPlotX(50, 0, 100, 20)).toBe(10);
  });
});
