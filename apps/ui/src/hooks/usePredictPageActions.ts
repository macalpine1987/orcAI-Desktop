import type { MutableRefObject } from "react";
import {
  batchSelectedNames,
  setQueueSelection,
  type PredictQueue,
} from "../workspace/predictQueue";

type Options = {
  queueRef: MutableRefObject<PredictQueue | null>;
  syncQueue: (next: PredictQueue | null) => void;
  selectActiveInQueue: (name: string) => void;
};

/** Select / batch-selection glue for Predict page. */
export function usePredictPageActions({
  queueRef,
  syncQueue,
  selectActiveInQueue,
}: Options) {
  const onSelectActive = (name: string) => {
    selectActiveInQueue(name);
  };

  const onToggleBatchSelect = (name: string) => {
    const q = queueRef.current;
    if (!q) return;
    const selected = new Set(batchSelectedNames(q));
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    syncQueue(setQueueSelection(q, selected));
  };

  return {
    onSelectActive,
    onToggleBatchSelect,
  };
}
