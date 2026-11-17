import type {
  SnippetCalculatorRequest,
  SnippetCalculatorResult,
  SnippetSplitId,
} from "../api/projects";
import { draftToParameterJson } from "./defaults";
import { ensureIdentity } from "./equivalences";
import type { TrainWizardDraft } from "./types";

const SPLITS: SnippetSplitId[] = ["train", "val", "test"];

/** Same body the calculator modal posts, so step 3 and the modal count one inventory. */
export function snippetCalculatorBody(draft: TrainWizardDraft): SnippetCalculatorRequest {
  const param = draftToParameterJson(draft) as {
    calls: string[];
    snippets: Record<string, number>;
    seed: number;
  };
  return {
    calls: param.calls,
    equivalences: ensureIdentity(draft.equivalencesMap, param.calls),
    snippets: param.snippets,
    batch_size: draft.model.batch_size,
    seed: param.seed,
  };
}

/**
 * Snippets the step-3 line should show.
 * `available` is the post-filter count (measured when a matching table exists,
 * otherwise the estimate orcAI keeps). The raw cut in `total` still includes
 * empty snippets that `fraction_removal` drops.
 */
export function snippetInventoryTotal(
  result: Pick<SnippetCalculatorResult, "splits"> | null,
): number {
  if (!result) return 0;
  return SPLITS.reduce((sum, split) => {
    const n = result.splits[split]?.available;
    return sum + (typeof n === "number" && Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Disk and prep time that follow a snippet count already cut the way orcAI cuts. */
export function estimateFromSnippetCount(snippets: number): {
  snippets: number;
  gb: number;
  minutes: number;
} {
  const n = Number.isFinite(snippets) ? Math.max(0, Math.round(snippets)) : 0;
  const gb = Math.round(n * 0.00008 * 10) / 10;
  const minutes = Math.max(1, Math.round(n / 1600));
  return { snippets: n, gb, minutes };
}

/** Current batches × batch size exceed the inventory the calculator will use. */
export function snippetDemandExceedsInventory(
  batches: number,
  batchSize: number,
  available: number,
): boolean {
  return batches * batchSize > available;
}

/**
 * Apply is allowed only when every split can fill at least one batch.
 * orcAI `create_tvt_snippet_tables` raises if a requested split has fewer
 * snippets than `n_batch * batch_size`, and zero batches leave that split empty.
 */
export function snippetCalcCanApply(
  result: Pick<SnippetCalculatorResult, "splits"> | null,
  loading: boolean,
): boolean {
  if (!result || loading) return false;
  return SPLITS.every((split) => result.splits[split].max >= 1);
}

export function snippetSplitsWithoutBatch(
  result: Pick<SnippetCalculatorResult, "splits"> | null,
): SnippetSplitId[] {
  if (!result) return [];
  return SPLITS.filter((split) => result.splits[split].max < 1);
}
