/** Snippet estimate abort/seq for TrainWizard step 3 (move-only extract). */
import { useEffect, useMemo, useRef, useState } from "react";
import { hasRuntimeSidecarBase } from "../api/sidecar";
import { calculateProjectSnippets } from "../api/projects";
import { isAbortError } from "../lib/fetchErrors";
import {
  snippetCalculatorBody,
  snippetInventoryTotal,
} from "./snippetCalc";
import type { TrainWizardDraft } from "./types";

type Args = {
  projectId: string | null;
  draft: TrainWizardDraft;
  draftRef: { current: TrainWizardDraft };
  sidecarPhase: string;
};

export function useTrainWizardSnippetEstimate({
  projectId,
  draft,
  draftRef,
  sidecarPhase,
}: Args) {
  /** Post-filter snippet count for the step-3 line. Null until the calculator answers. */
  const [snippetInventory, setSnippetInventory] = useState<number | null>(null);

  const snippetEstimateKey = useMemo(
    () => JSON.stringify(snippetCalculatorBody(draft)),
    [draft],
  );
  const snippetEstimateSeq = useRef(0);

  useEffect(() => {
    setSnippetInventory(null);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || draft.step !== "spectro") return;
    if (sidecarPhase !== "running" || !hasRuntimeSidecarBase()) return;
    const seq = ++snippetEstimateSeq.current;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      const current = draftRef.current;
      void calculateProjectSnippets(
        projectId,
        snippetCalculatorBody(current),
        ctrl.signal,
      )
        .then((res) => {
          if (seq !== snippetEstimateSeq.current) return;
          setSnippetInventory(snippetInventoryTotal(res));
        })
        .catch((err) => {
          if (seq !== snippetEstimateSeq.current || isAbortError(err)) return;
          setSnippetInventory(null);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [projectId, draft.step, sidecarPhase, snippetEstimateKey, draftRef]);

  return { snippetInventory };
}
