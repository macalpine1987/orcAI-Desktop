import { describe, expect, it } from "vitest";
import type { SnippetCalculatorResult } from "../api/projects";
import { emptyDraft } from "./defaults";
import {
  estimateFromSnippetCount,
  snippetCalcCanApply,
  snippetCalculatorBody,
  snippetDemandExceedsInventory,
  snippetInventoryTotal,
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

describe("step 3 snippet estimate", () => {
  it("sums snippets kept after the filter, not the raw cut", () => {
    const inventory = result({ train: 53, val: 2, test: 2 });
    inventory.splits.train.total = 960;
    inventory.splits.val.total = 120;
    inventory.splits.test.total = 120;
    expect(snippetInventoryTotal(inventory)).toBe(57);
    expect(estimateFromSnippetCount(snippetInventoryTotal(inventory)).snippets).toBe(57);
  });

  it("does not count recordings twice or shrink removal by 0.15", () => {
    // 10 recordings, 200 s segments, 3 snippets/s and removal 0.99 used to become
    // round(10 * 200 * 3 * (1 - 0.99 * 0.15) * 10) = 5_109_000.
    const shown = estimateFromSnippetCount(
      snippetInventoryTotal(result({ train: 53, val: 2, test: 2 })),
    );
    expect(shown.snippets).toBe(57);
    expect(shown.snippets).toBeLessThan(10_000);
  });

  it("keeps the existing disk and prep scaling of whatever count orcAI kept", () => {
    expect(estimateFromSnippetCount(20_000)).toEqual({
      snippets: 20_000,
      gb: 1.6,
      minutes: 13,
    });
    expect(estimateFromSnippetCount(0)).toEqual({ snippets: 0, gb: 0, minutes: 1 });
    expect(estimateFromSnippetCount(Number.NaN).snippets).toBe(0);
  });

  it("posts the same snippet fields the wizard edits", () => {
    const draft = emptyDraft("Fjord");
    draft.classes = [
      {
        id: "BUZZ",
        count: 4,
        recordings: 2,
        duration_sec: 12,
        coverage: 0.1,
        selected: true,
      },
      {
        id: "WHISTLE",
        count: 1,
        recordings: 1,
        duration_sec: 3,
        coverage: 0.1,
        selected: false,
      },
    ];
    draft.spectro.fraction_removal = 0.99;
    draft.equivalencesMap = { Buzz3: "BUZZ" };
    const body = snippetCalculatorBody(draft);
    expect(body.calls).toEqual(["BUZZ"]);
    expect(body.equivalences.Buzz3).toBe("BUZZ");
    expect(body.equivalences.BUZZ).toBe("BUZZ");
    expect(body.snippets.fraction_removal).toBe(0.99);
    expect(body.snippets.segment_duration).toBe(draft.spectro.segment_duration);
    expect(body.batch_size).toBe(draft.model.batch_size);
  });
});

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
