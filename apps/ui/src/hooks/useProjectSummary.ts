import { useCallback, useEffect, useState } from "react";
import {
  fetchProjectSummary,
  type ProjectSummary,
} from "../api/projects";
import { clearActiveProjectIf } from "../workspace/project";
import { useSidecarStatus } from "./useSidecarStatus";

type UseProjectSummaryResult = {
  summary: ProjectSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function isProjectNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /project not found/i.test(msg);
}

export function useProjectSummary(
  projectId: string | null,
): UseProjectSummaryResult {
  const { online } = useSidecarStatus();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!projectId || !online) {
        setSummary(null);
        setLoading(false);
        setError(null);
        return;
      }
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchProjectSummary(projectId);
        setSummary(data);
      } catch (err) {
        if (isProjectNotFound(err)) {
          clearActiveProjectIf(projectId, { notice: true });
          setSummary(null);
          setError(null);
          return;
        }
        if (!silent) setSummary(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [online, projectId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectId || !online) return;
    const id = window.setInterval(() => {
      void refresh({ silent: true });
    }, 8000);
    return () => window.clearInterval(id);
  }, [online, projectId, refresh]);

  const refreshPublic = useCallback(() => refresh({ silent: false }), [refresh]);

  return { summary, loading, error, refresh: refreshPublic };
}
