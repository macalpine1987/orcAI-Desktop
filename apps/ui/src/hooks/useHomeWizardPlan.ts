import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchProjectPipeline,
  type ProjectPipeline,
} from "../api/projects";
import {
  homeWizardPlanFromBoard,
  homeWizardPlanIsBusy,
  type HomeWizardPlanView,
} from "../lib/homeWizardPlan";
import { isAbortError } from "../lib/fetchErrors";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";
import {
  HOME_WIZARD_POLL_BUSY_MS,
  HOME_WIZARD_POLL_IDLE_MS,
} from "../lib/pollIntervals";
import { useSidecarStatus } from "./useSidecarStatus";

type Result = {
  plan: HomeWizardPlanView | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Home-only: poll ``GET /v1/projects/{id}/pipeline`` and expose the wizard
 * ``active_plan`` as rail steps. Manual pipeline runs never surface here.
 */
export function useHomeWizardPlan(projectId: string | null): Result {
  const { online } = useSidecarStatus();
  const [board, setBoard] = useState<ProjectPipeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardRef = useRef<ProjectPipeline | null>(null);
  boardRef.current = board;

  const load = useCallback(
    async (silent = false) => {
      if (!projectId || !online) {
        setBoard(null);
        setError(null);
        return;
      }
      if (!silent && !boardRef.current) setLoading(true);
      try {
        const data = await fetchProjectPipeline(projectId);
        setBoard(data);
        setError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        // Keep last board for KPIs; surface a soft error on first/visible load.
        if (!silent || !boardRef.current) {
          setError(formatUserFacingErrorI18n(err));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId, online],
  );

  useEffect(() => {
    if (!projectId || !online) {
      setBoard(null);
      return;
    }
    void load(false);
  }, [projectId, online, load]);

  useEffect(() => {
    if (!projectId || !online) return;
    const busy = homeWizardPlanIsBusy(board?.active_plan);
    const ms = busy ? HOME_WIZARD_POLL_BUSY_MS : HOME_WIZARD_POLL_IDLE_MS;
    const id = window.setInterval(() => {
      void load(true);
    }, ms);
    return () => window.clearInterval(id);
  }, [projectId, online, board?.active_plan, load]);

  const plan = useMemo(() => homeWizardPlanFromBoard(board), [board]);

  return {
    plan,
    loading,
    error,
    refresh: () => load(true),
  };
}
