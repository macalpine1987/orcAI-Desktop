import { describe, expect, it } from "vitest";
import {
  detectionRowMatchesSelection,
  detectionRowsForTable,
  detectionRowsInRange,
  detectionTypeCounts,
  findDetectionRowForSelection,
  leadDetectionIdInViewport,
} from "./spectrogramDetections";
import { formatSpectrogramTimestamp } from "./formatSpectrogramTime";
import type { DetectionSegmentInput } from "./spectrogramDetections";

describe("formatSpectrogramTimestamp", () => {
  it("formats minutes and fractional seconds", () => {
    expect(formatSpectrogramTimestamp(14.2)).toBe("00:14.2");
    expect(formatSpectrogramTimestamp(74.5)).toBe("01:14.5");
    expect(formatSpectrogramTimestamp(3661)).toBe("1:01:01.0");
  });
});

describe("leadDetectionIdInViewport", () => {
  it("returns the first row intersecting the body viewport", () => {
    const rows = [
      { id: "a", top: 0, bottom: 20 },
      { id: "b", top: 20, bottom: 40 },
      { id: "c", top: 40, bottom: 60 },
    ];
    // Sticky header ends at 18; row a only peeks 2px (≤ epsilon) → lead is b.
    expect(leadDetectionIdInViewport(rows, 18, 90)).toBe("b");
    expect(leadDetectionIdInViewport(rows, 21, 90)).toBe("b");
    expect(leadDetectionIdInViewport(rows, 41, 90)).toBe("c");
  });

  it("returns null when nothing intersects", () => {
    expect(
      leadDetectionIdInViewport([{ id: "a", top: 0, bottom: 10 }], 40, 80),
    ).toBeNull();
  });
});

describe("findDetectionRowForSelection", () => {
  const row = (
    id: string,
    t0: number,
    t1: number,
    label: string,
  ): import("./spectrogramDetections").DetectionRow => ({
    id,
    t0,
    t1,
    durationSec: t1 - t0,
    label,
    confidence: 0.9,
    hzMin: null,
    hzMax: null,
    fileName: "a.wav",
  });

  it("matches exact interval", () => {
    const rows = [row("1", 10, 12, "whistle"), row("2", 20, 21, "buzz")];
    expect(
      findDetectionRowForSelection(rows, { t0: 10, t1: 12, label: "whistle" })
        ?.id,
    ).toBe("1");
  });

  it("falls back to overlapping same-label row", () => {
    const rows = [row("1", 10.0, 12.0, "whistle")];
    expect(
      findDetectionRowForSelection(rows, {
        t0: 10.08,
        t1: 12.05,
        label: "whistle",
      })?.id,
    ).toBe("1");
  });

  it("matches the closer of two nearby same-class intervals", () => {
    const rows = [
      row("1", 10.0, 11.0, "whistle"),
      row("2", 10.08, 11.1, "whistle"),
    ];
    expect(
      findDetectionRowForSelection(rows, {
        t0: 10.08,
        t1: 11.1,
        label: "whistle",
      })?.id,
    ).toBe("2");
  });
});

describe("detectionRowsForTable", () => {
  const seg = (
    start: number,
    stop: number,
    label: string,
    mean_p: number | null,
  ): DetectionSegmentInput => ({
    start,
    stop,
    label,
    mean_p,
    source: "primary",
    time_unit: "seconds",
  });

  it("sorts by start time and filters confidence", () => {
    const rows = detectionRowsForTable(
      [
        seg(31, 31.8, "whistle", 0.81),
        seg(14.2, 16.3, "call", 0.94),
        seg(50, 51, "noise", 0.2),
      ],
      {
        deltaT: null,
        durationSec: 120,
        confidenceMin: 0.5,
        primaryOnly: true,
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe("call");
    expect(rows[1]?.label).toBe("whistle");
  });

  it("excludes mean_p equal to the floor (strictly greater)", () => {
    const rows = detectionRowsForTable(
      [seg(1, 2, "edge", 0.9), seg(3, 4, "keep", 0.91)],
      {
        deltaT: null,
        durationSec: 120,
        confidenceMin: 0.9,
        primaryOnly: true,
      },
    );
    expect(rows.map((r) => r.label)).toEqual(["keep"]);
  });

  it("omits classes hidden on the spectrogram", () => {
    const rows = detectionRowsForTable(
      [seg(1, 2, "WHISTLE", 0.9), seg(3, 4, "BR", 0.9)],
      {
        deltaT: null,
        durationSec: 120,
        confidenceMin: 0,
        hiddenLabels: new Set(["WHISTLE"]),
      },
    );
    expect(rows.map((r) => r.label)).toEqual(["BR"]);
  });

  it("matches selected interval", () => {
    const row = {
      id: "a",
      t0: 1,
      t1: 2,
      durationSec: 1,
      label: "x",
      confidence: 1,
      hzMin: null,
      hzMax: null,
      fileName: "",
    };
    expect(detectionRowMatchesSelection(row, { t0: 1, t1: 2 })).toBe(true);
    expect(detectionRowMatchesSelection(row, { t0: 2, t1: 3 })).toBe(false);
  });

  it("disambiguates equal intervals by label", () => {
    const row = {
      id: "a",
      t0: 1,
      t1: 2,
      durationSec: 1,
      label: "whistles",
      confidence: 1,
      hzMin: null,
      hzMax: null,
      fileName: "",
    };
    expect(
      detectionRowMatchesSelection(row, { t0: 1, t1: 2, label: "whistles" }),
    ).toBe(true);
    expect(
      detectionRowMatchesSelection(row, { t0: 1, t1: 2, label: "buzzing" }),
    ).toBe(false);
  });

  it("carries frequency bounds and file name", () => {
    const rows = detectionRowsForTable(
      [
        {
          start: 1,
          stop: 2,
          label: "WHISTLE",
          mean_p: 0.9,
          source: "primary",
          time_unit: "seconds",
          hz_min: 4500,
          hz_max: 6500,
        },
      ],
      {
        deltaT: null,
        durationSec: 120,
        confidenceMin: 0,
        fileName: "clip.wav",
      },
    );
    expect(rows[0]?.hzMin).toBe(4500);
    expect(rows[0]?.hzMax).toBe(6500);
    expect(rows[0]?.fileName).toBe("clip.wav");
  });
});

describe("detectionRowsInRange", () => {
  const row = (
    id: string,
    t0: number,
    t1: number,
    label = "x",
  ): import("./spectrogramDetections").DetectionRow => ({
    id,
    t0,
    t1,
    durationSec: t1 - t0,
    label,
    confidence: 1,
    hzMin: null,
    hzMax: null,
    fileName: "",
  });

  it("keeps rows overlapping the segment window", () => {
    const rows = [
      row("a", 10, 12),
      row("b", 190, 205),
      row("c", 210, 212),
      row("d", 199.5, 199.9),
    ];
    const inSeg = detectionRowsInRange(rows, 0, 200);
    expect(inSeg.map((r) => r.id)).toEqual(["a", "b", "d"]);
  });
});

describe("detectionTypeCounts", () => {
  it("aggregates counts by label", () => {
    const rows = [
      { id: "1", t0: 0, t1: 1, durationSec: 1, label: "whistles", confidence: 1, hzMin: null, hzMax: null, fileName: "" },
      { id: "2", t0: 2, t1: 3, durationSec: 1, label: "whistles", confidence: 1, hzMin: null, hzMax: null, fileName: "" },
      { id: "3", t0: 4, t1: 5, durationSec: 1, label: "buzzing", confidence: 1, hzMin: null, hzMax: null, fileName: "" },
    ];
    expect(detectionTypeCounts(rows, (labels) => [...labels].sort())).toEqual([
      { label: "buzzing", count: 1 },
      { label: "whistles", count: 2 },
    ]);
  });
});
