import { describe, expect, it } from "vitest";
import {
  PROB_LABEL_MIN_GAP_PCT,
  selectVisibleProbLabelIndices,
} from "./spectrogramProbLabels";

describe("selectVisibleProbLabelIndices", () => {
  it("keeps spaced labels in one lane", () => {
    const show = selectVisibleProbLabelIndices(
      [
        { index: 0, centerPct: 10, widthPct: 2, laneKey: "SS" },
        { index: 1, centerPct: 10 + PROB_LABEL_MIN_GAP_PCT, widthPct: 2, laneKey: "SS" },
        { index: 2, centerPct: 10 + PROB_LABEL_MIN_GAP_PCT * 2, widthPct: 2, laneKey: "SS" },
      ],
      PROB_LABEL_MIN_GAP_PCT,
    );
    expect([...show].sort()).toEqual([0, 1, 2]);
  });

  it("drops a colliding neighbor but keeps the first", () => {
    const show = selectVisibleProbLabelIndices([
      { index: 0, centerPct: 20, widthPct: 3, laneKey: "BUZZ" },
      { index: 1, centerPct: 21, widthPct: 3, laneKey: "BUZZ" },
      { index: 2, centerPct: 40, widthPct: 3, laneKey: "BUZZ" },
    ]);
    expect(show.has(0)).toBe(true);
    expect(show.has(1)).toBe(false);
    expect(show.has(2)).toBe(true);
  });

  it("always keeps forceShow even when cramped", () => {
    const show = selectVisibleProbLabelIndices([
      { index: 0, centerPct: 20, widthPct: 3, laneKey: "SS" },
      { index: 1, centerPct: 21, widthPct: 3, laneKey: "SS", forceShow: true },
      { index: 2, centerPct: 22, widthPct: 3, laneKey: "SS" },
    ]);
    expect(show.has(1)).toBe(true);
    expect(show.has(0)).toBe(false);
    expect(show.has(2)).toBe(false);
  });

  it("does not collide across different class lanes", () => {
    const show = selectVisibleProbLabelIndices([
      { index: 0, centerPct: 50, widthPct: 4, laneKey: "SS" },
      { index: 1, centerPct: 50, widthPct: 4, laneKey: "BUZZ" },
    ]);
    expect(show.has(0)).toBe(true);
    expect(show.has(1)).toBe(true);
  });

  it("skips hairline marks unless forced", () => {
    const show = selectVisibleProbLabelIndices([
      { index: 0, centerPct: 10, widthPct: 0.2, laneKey: "SS" },
      { index: 1, centerPct: 30, widthPct: 0.2, laneKey: "SS", forceShow: true },
    ]);
    expect(show.has(0)).toBe(false);
    expect(show.has(1)).toBe(true);
  });
});
