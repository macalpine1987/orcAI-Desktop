import { describe, expect, it } from "vitest";
import {
  segmentBoundaryLabel,
  shouldResetViewForDetection,
  snapMinimapToSegment,
  resolveSpectrogramPan,
  resolveSpectrogramPanFree,
  viewDiffersFromSegment,
  viewStartCenteredOnTime,
  viewWindowForFocusedDetection,
} from "./spectrogramViewerLogic";
import { spectrogramSegmentWindow } from "./spectrogramView";
import {
  resolvePlayheadSeek,
  viewStartForPlayhead,
} from "./spectrogramPlayer";

describe("spectrogramViewerLogic", () => {
  it("detects zoomed view inside segment", () => {
    const seg = spectrogramSegmentWindow(1, 500);
    expect(
      viewDiffersFromSegment(seg.viewStart + 10, 30, 1, 500),
    ).toBe(true);
    expect(
      viewDiffersFromSegment(seg.viewStart, seg.viewSpan, 1, 500),
    ).toBe(false);
  });

  it("detects small pan away from segment start", () => {
    const seg = spectrogramSegmentWindow(1, 500);
    expect(
      viewDiffersFromSegment(seg.viewStart + 0.2, seg.viewSpan, 1, 500),
    ).toBe(true);
  });

  it("should not reset view when detection inside zoomed window", () => {
    const viewStart = 210;
    const viewEnd = 240;
    expect(
      shouldResetViewForDetection(215, 220, viewStart, viewEnd, 1, 500),
    ).toBe(false);
  });

  it("should reset when detection in another segment", () => {
    expect(
      shouldResetViewForDetection(50, 55, 210, 240, 1, 500),
    ).toBe(true);
  });

  it("keeps zoom when detection inside current window", () => {
    expect(
      shouldResetViewForDetection(215, 218, 210, 240, 1, 500),
    ).toBe(false);
  });

  it("snaps minimap to segment start", () => {
    expect(snapMinimapToSegment(250, 500)).toBe(200);
    expect(segmentBoundaryLabel(1, 500).t0).toBe(200);
  });

  it("resets to last segment for a late-file detection (whole-file table)", () => {
    // Viewing segment 0; last detection near end of a 450 s file.
    const next = viewWindowForFocusedDetection(430, 440, 0, 200, 0, 450);
    expect(next.reset).toBe(true);
    expect(next.segmentIndex).toBe(2);
    expect(next.viewStart).toBe(400);
    expect(next.viewSpan).toBe(50);

    // Stale seekToTime(viewStart=0) would have panned to ~230; the detection
    // end (440) sits past that window, so the overlay would miss it.
    const { playhead, atStart, atEnd } = resolvePlayheadSeek(430, 450);
    const stalePan = viewStartForPlayhead(playhead, 0, 200, 450, atStart, atEnd);
    expect(stalePan).toBe(230);
    expect(stalePan + 200).toBeLessThan(440);

    const focusedPan = viewStartForPlayhead(
      playhead,
      next.viewStart,
      next.viewSpan,
      450,
      atStart,
      atEnd,
    );
    expect(focusedPan).toBe(400);
    expect(430).toBeGreaterThanOrEqual(focusedPan);
    expect(440).toBeLessThanOrEqual(focusedPan + next.viewSpan);
  });
});

describe("resolveSpectrogramPan", () => {
  it("pans within a zoomed segment", () => {
    const r = resolveSpectrogramPan({
      viewStart: 210,
      viewSpan: 20,
      segmentIndex: 1,
      durationSec: 450,
      deltaSec: 5,
    });
    expect(r).toEqual({ kind: "view", viewStart: 215, segmentIndex: 1 });
  });

  it("advances to the next segment at the right edge", () => {
    const r = resolveSpectrogramPan({
      viewStart: 200,
      viewSpan: 200,
      segmentIndex: 1,
      durationSec: 450,
      deltaSec: 1,
    });
    expect(r).toEqual({ kind: "segment", segmentIndex: 2 });
  });

  it("clamps to the segment end before advancing when zoomed", () => {
    const r = resolveSpectrogramPan({
      viewStart: 210,
      viewSpan: 20,
      segmentIndex: 1,
      durationSec: 450,
      deltaSec: 500,
    });
    expect(r).toEqual({ kind: "view", viewStart: 380, segmentIndex: 1 });
  });

  it("advances after already sitting on the right edge", () => {
    const r = resolveSpectrogramPan({
      viewStart: 380,
      viewSpan: 20,
      segmentIndex: 1,
      durationSec: 450,
      deltaSec: 1,
    });
    expect(r).toEqual({ kind: "segment", segmentIndex: 2 });
  });

  it("does not advance past the last segment", () => {
    const last = spectrogramSegmentWindow(2, 450);
    const r = resolveSpectrogramPan({
      viewStart: last.viewStart,
      viewSpan: last.viewSpan,
      segmentIndex: 2,
      durationSec: 450,
      deltaSec: 10,
    });
    expect(r).toEqual({
      kind: "view",
      viewStart: last.viewStart,
      segmentIndex: 2,
    });
  });

  it("goes to the previous segment at the left edge", () => {
    const r = resolveSpectrogramPan({
      viewStart: 200,
      viewSpan: 200,
      segmentIndex: 1,
      durationSec: 450,
      deltaSec: -1,
    });
    expect(r).toEqual({ kind: "segment", segmentIndex: 0 });
  });
});

describe("resolveSpectrogramPanFree", () => {
  it("crosses segment boundaries without resetting the window", () => {
    const r = resolveSpectrogramPanFree({
      viewStart: 180,
      viewSpan: 40,
      durationSec: 450,
      deltaSec: 50,
    });
    expect(r.viewStart).toBe(230);
    expect(r.segmentIndex).toBe(1);
  });

  it("clamps to the file end", () => {
    const r = resolveSpectrogramPanFree({
      viewStart: 400,
      viewSpan: 40,
      durationSec: 450,
      deltaSec: 100,
    });
    expect(r.viewStart).toBe(410);
    expect(r.segmentIndex).toBe(2);
  });
});

describe("viewStartCenteredOnTime", () => {
  it("centers the window on the given time", () => {
    expect(viewStartCenteredOnTime(100, 40, 500)).toBe(80);
  });

  it("clamps near file start and end", () => {
    expect(viewStartCenteredOnTime(5, 40, 500)).toBe(0);
    expect(viewStartCenteredOnTime(490, 40, 500)).toBe(460);
  });
});
