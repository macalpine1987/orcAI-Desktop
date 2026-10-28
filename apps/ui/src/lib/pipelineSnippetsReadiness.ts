/** Shared snippets-readiness snapshot for lamp + shell banner (same poll). */

export type SnippetsReadinessSnapshot = {
  state: string;
  actual: number | null;
  required: number;
  n_batch: number;
  batch_size: number;
  split?: "train" | "val" | "test";
};

type Listener = (snap: SnippetsReadinessSnapshot | null) => void;

let latest: SnippetsReadinessSnapshot | null = null;
const listeners = new Set<Listener>();

export function publishSnippetsReadiness(
  snap: SnippetsReadinessSnapshot | null,
): void {
  latest = snap;
  for (const fn of listeners) fn(snap);
}

export function subscribeSnippetsReadiness(fn: Listener): () => void {
  listeners.add(fn);
  fn(latest);
  return () => {
    listeners.delete(fn);
  };
}

export function clearSnippetsReadiness(): void {
  publishSnippetsReadiness(null);
}
