import { useEffect } from "react";
import {
  PIPELINE_POLL_BUSY_MS as POLL_BUSY_MS,
  PIPELINE_POLL_IDLE_MS as POLL_IDLE_MS,
} from "../lib/pollIntervals";

/**
 * Focus / visibility / interval refresh for the pipeline board.
 * Cadence follows pollIntervals (busy vs idle).
 */
export function usePipelineBoardPoll(opts: {
  projectId: string | null;
  pipelineBusy: boolean;
  wizardPlanActive: boolean;
  load: (silent?: boolean, fresh?: boolean) => Promise<void>;
}): void {
  const { projectId, pipelineBusy, wizardPlanActive, load } = opts;

  useEffect(() => {
    if (!projectId) return;
    const intervalMs = pipelineBusy || wizardPlanActive ? POLL_BUSY_MS : POLL_IDLE_MS;
    const id = window.setInterval(() => void load(true), intervalMs);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, projectId, pipelineBusy, wizardPlanActive]);
}
