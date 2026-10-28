import { describe, expect, it } from "vitest";
import type { SnippetCalculatorResult } from "../api/projects";
import {
  snippetCalcCanApply,
  snippetDemandExceedsInventory,
  snippetSplitsWithoutBatch,
} from "./snippetCalc";

function result(
  max: Partial<Record<"train" | "val" | "test", number>>,
): SnippetCalculatorResult {
  const row = (n: number) => ({
    total: n,
    labelled: n,
    kept: n,
    measured: null,
    available: n,
    max: n,
    suggested: n,
  });
  return {
    project_id: "p",
    source: "estimate",
    batch_size: 32,
    recordings_annotated: 1,
    recordings_used: 1,
    recordings_too_short: 0,
    recordings_no_duration: 0,
    snippet_table: { exists: false, matches_params: false },
    safety_margin: 0.9,
    splits: {
      train: row(max.train ?? 10),
      val: row(max.val ?? 2),
      test: row(max.test ?? 2),
    },
  };
}

describe("snippet calculator apply rules", () => {
  it("blocks apply while loading or before a result", () => {
    expect(snippetCalcCanApply(null, false)).toBe(false);
    expect(snippetCalcCanApply(result({}), true)).toBe(false);
  });

  it("requires one full batch in every split", () => {
    expect(snippetCalcCanApply(result({}), false)).toBe(true);
    expect(snippetCalcCanApply(result({ val: 0 }), false)).toBe(false);
    expect(snippetSplitsWithoutBatch(result({ test: 0 }))).toEqual(["test"]);
    expect(snippetSplitsWithoutBatch(null)).toEqual([]);
  });

  it("marks a split short only when demand exceeds inventory", () => {
    expect(snippetDemandExceedsInventory(10, 32, 320)).toBe(false);
    expect(snippetDemandExceedsInventory(10, 32, 319)).toBe(true);
    expect(snippetDemandExceedsInventory(0, 32, 0)).toBe(false);
  });
});
