import type { SnippetCalculatorResult, SnippetSplitId } from "../api/projects";

const SPLITS: SnippetSplitId[] = ["train", "val", "test"];

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
