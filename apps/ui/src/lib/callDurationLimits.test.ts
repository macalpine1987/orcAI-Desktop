import { describe, expect, it } from "vitest";
import {
  boundToInput,
  collapseNoOpClassLimits,
  classesUsingDefaultLimit,
  durationHistogram,
  durationPercentile,
  histogramBinWidth,
  histogramCountTicks,
  histogramSpanFor,
  durationKept,
  durationsForSelectedLimit,
  durationFromPlotX,
  filterTableClassKeys,
  publicationExampleFitsClasses,
  boundsFromBrush,
  nextSnapAbove,
  previousSnapBelow,
  snapDuration,
  filteredOutputPath,
  resolveFilterJobOutputPath,
  inputToBound,
  isDurationBoundDraft,
  isDurationPairInverted,
  isNoOpDurationLimits,
  limitsHaveInvertedPairs,
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

  it("flags inverted min/max duration pairs", () => {
    expect(isDurationPairInverted(0.5, 0.1)).toBe(true);
    expect(isDurationPairInverted(0.1, 0.5)).toBe(false);
    expect(isDurationPairInverted(null, 0.5)).toBe(false);
    expect(
      limitsHaveInvertedPairs({ default: [1, 0.2], WHISTLE: [0.1, null] }),
    ).toBe(true);
    expect(
      limitsHaveInvertedPairs({ default: [0.1, 0.5], WHISTLE: [0.1, null] }),
    ).toBe(false);
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
    const short = durationHistogram([0.1, 0.2, 1.5], [0.15, null]);
    expect(short.span).toBe(2);
    expect(short.binWidth).toBe(0.05);
    expect(short.bins).toHaveLength(40);
    expect(short.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(short.tails.every((band) => band.count === 0)).toBe(true);
    expect(short.bins.reduce((n, b) => n + b.keep, 0)).toBe(2);
    expect(durationKept(0.15, 0.15, 1)).toBe(true);
    expect(durationKept(1, 0.15, 1)).toBe(true);
    expect(durationKept(1.01, 0.15, 1)).toBe(false);
    expect(durationKept(0.01, null, null)).toBe(true);
    const limitsDoNotStretch = durationHistogram([0.2], [0, 4]);
    expect(limitsDoNotStretch.span).toBe(2);
    expect(limitsDoNotStretch.tails.every((band) => band.count === 0)).toBe(true);
  });

  it("covers the bulk of long calls and splits the rest into two tails", () => {
    const durations = [...Array.from({ length: 37 }, () => 1), 7, 10, 20];
    expect(durationPercentile(durations, 0.95)).toBe(7);
    expect(histogramSpanFor(7)).toBe(8);
    expect(histogramBinWidth(8)).toBe(0.25);
    const hist = durationHistogram(durations, [1, 6.5]);
    expect(hist.span).toBe(8);
    expect(hist.binWidth).toBe(0.25);
    expect(hist.bins).toHaveLength(32);
    expect(hist.bins.reduce((n, b) => n + b.count, 0)).toBe(38);
    expect(hist.tails[0]).toEqual({ start: 8, end: 12, count: 1, keep: 0 });
    expect(hist.tails[1]).toEqual({ start: 12, end: null, count: 1, keep: 0 });
    expect(durationHistogram(durations, [0, 30]).span).toBe(8);
    const capped = durationHistogram([40], [null, null]);
    expect(capped.span).toBe(30);
    expect(capped.tails[0]?.count).toBe(1);
    expect(durationHistogram([], [null, null]).span).toBe(2);
    expect(histogramCountTicks(24)).toEqual([24, 12, 0]);
    expect(histogramCountTicks(0)).toEqual([0]);
    expect(histogramCountTicks(1)).toEqual([1, 0]);
  });

  it("keeps time marks on column edges and an exact boundary in the named interval", () => {
    expect(histogramBinWidth(4)).toBe(0.1);
    for (const span of [2, 4, 8, 12, 16, 20]) {
      const width = histogramBinWidth(span);
      expect(Number.isInteger(span / width)).toBe(true);
      for (const part of [0, 0.25, 0.5, 0.75, 1]) {
        const at = span * part;
        expect(at / width).toBeCloseTo(Math.round(at / width), 6);
      }
    }
    const onAxisEnd = durationHistogram([8], [null, null]);
    expect(onAxisEnd.span).toBe(8);
    expect(onAxisEnd.bins.at(-1)?.count).toBe(1);
    expect(onAxisEnd.tails.every((band) => band.count === 0)).toBe(true);
    const onSplit = durationHistogram(
      [...Array.from({ length: 37 }, () => 1), 7, 12],
      [null, null],
    );
    expect(onSplit.span).toBe(8);
    expect(onSplit.tails[0]?.count).toBe(1);
    expect(onSplit.tails[1]?.count).toBe(0);
  });

  it("lists only classes that were found, then splits a shared default", () => {
    const classes = [
      { label: "WHISTLE", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "BUZZ", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "PHS", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "SS", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "BR", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "HERDING", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "TAILSLAP", found: 0, keep: 0, drop: 0, durations: [] },
      { label: "QAL", found: 2, keep: 2, drop: 0, durations: [0.2, 0.4] },
      { label: "NIB", found: 1, keep: 0, drop: 1, durations: [0.1] },
      { label: "KAZ", found: 4, keep: 3, drop: 1, durations: [1, 1, 1, 1] },
      { label: "VEM", found: 1, keep: 1, drop: 0, durations: [0.8] },
    ];
    expect(filterTableClassKeys(classes)).toEqual(["QAL", "NIB", "KAZ", "VEM"]);
    const shared = classesUsingDefaultLimit(classes, {
      default: [0, null],
      KAZ: [0.2, null],
    });
    expect(shared.map((row) => row.label)).toEqual(["QAL", "NIB", "VEM"]);
    expect(shared.reduce((sum, row) => sum + row.found, 0)).toBe(4);
    expect(durationsForSelectedLimit("default", classes, {
      default: [0, null],
      KAZ: [0.2, null],
    })).toEqual([]);
    expect(durationsForSelectedLimit("default", [classes[7]!], {
      default: [0, null],
    })).toEqual([0.2, 0.4]);
    expect(publicationExampleFitsClasses(classes)).toBe(false);
    expect(publicationExampleFitsClasses([
      { label: "WHISTLE", found: 1 },
      { label: "PHS", found: 0 },
    ])).toBe(true);
    expect(publicationExampleFitsClasses([])).toBe(false);
  });

  it("maps a histogram brush to min/max, leaving max open at the right edge", () => {
    expect(boundsFromBrush(0.4, 12, 20)).toEqual([0.4, 12]);
    expect(boundsFromBrush(12, 0.4, 20)).toEqual([0.4, 12]);
    expect(boundsFromBrush(0.4, 19.7, 20)[1]).toBeNull();
    // A brush thinner than the 0.05 s grid stays a closed interval.
    expect(boundsFromBrush(0.33, 0.36, 2)).toEqual([0.35, 0.4]);
    expect(boundsFromBrush(0.4, 0.42, 2)[1]).not.toBeNull();
    expect(boundsFromBrush(1.1, 1.12, 8, 0.25)).toEqual([1, 1.25]);
    expect(boundsFromBrush(1.1, 7.9, 8, 0.25)[1]).toBeNull();
    expect(nextSnapAbove(0.4)).toBe(0.45);
    expect(nextSnapAbove(1, 0.25)).toBe(1.25);
    expect(previousSnapBelow(0.4)).toBe(0.35);
    expect(previousSnapBelow(1, 0.25)).toBe(0.75);
    expect(previousSnapBelow(0)).toBe(0);
    expect(snapDuration(0.07)).toBe(0.07);
    expect(durationFromPlotX(50, 0, 100, 20)).toBe(10);
    const pinned = durationHistogram([0.2, 9], [1.9, null], 2);
    expect(pinned.span).toBe(2);
    expect(pinned.tails[1]).toMatchObject({ count: 1, keep: 1 });
    expect(durationHistogram([0.2, 9], [1.9, null]).span).toBe(12);
  });
});
