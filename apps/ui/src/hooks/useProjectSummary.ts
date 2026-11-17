import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchProjectSummary,
  type ProjectSummary,
} from "../api/projects";
import {
  errorText,
  formatUserFacingErrorRequired,
} from "../lib/userFacingError";
import { PROJECT_SUMMARY_POLL_MS } from "../lib/pollIntervals";
import { clearActiveProjectIf } from "../workspace/project";
import { useSidecarStatus } from "./useSidecarStatus";

type UseProjectSummaryResult = {
  summary: ProjectSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SUMMARY_TTL_MS = 4_000;

type SummarySlot = {
  at: number;
  summary: ProjectSummary | null;
  pending?: Promise<ProjectSummary>;
  stamp?: object;
};

const summarySlots = new Map<string, SummarySlot>();
const SUMMARY_SLOTS_MAX = 24;

function trimSummarySlots(): void {
  while (summarySlots.size > SUMMARY_SLOTS_MAX) {
    const oldest = summarySlots.keys().next().value;
    if (oldest == null) break;
    summarySlots.delete(oldest);
  }
}

function isProjectNotFound(err: unknown): boolean {
  return /project not found/i.test(errorText(err));
}

export function peekProjectSummary(projectId: string): ProjectSummary | null {
  return summarySlots.get(projectId)?.summary ?? null;
}

/** One in-flight request per project unless the caller asks for a fresh walk. */
export function loadProjectSummary(
  projectId: string,
  fresh: boolean,
): Promise<ProjectSummary> {
  const slot = summarySlots.get(projectId);
  if (!fresh && slot?.pending) return slot.pending;
  if (!fresh && slot?.summary && Date.now() - slot.at <= SUMMARY_TTL_MS) {
    return Promise.resolve(slot.summary);
  }
  const stamp = {};
  const kept = {
    at: slot?.at ?? 0,
    summary: slot?.summary ?? null,
    stamp,
  };
  summarySlots.set(projectId, kept);
  trimSummarySlots();
  const request = fetchProjectSummary(projectId, fresh ? { fresh: true } : undefined);
  const pending = request.then(
    (summary) => {
      const cur = summarySlots.get(projectId);
      if (!cur?.stamp || cur.stamp === stamp) {
        summarySlots.set(projectId, { at: Date.now(), summary, stamp });
      }
      return summary;
    },
    (err: unknown) => {
      const cur = summarySlots.get(projectId);
      if (cur?.stamp === stamp) {
        summarySlots.set(projectId, { at: cur.at, summary: cur.summary });
      }
      throw err;
    },
  );
  if (!fresh) {
    summarySlots.set(projectId, { ...kept, pending });
  }
  return pending;
}

export function useProjectSummary(
  projectId: string | null,
): UseProjectSummaryResult {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const [summary, setSummary] = useState<ProjectSummary | null>(
    projectId ? peekProjectSummary(projectId) : null,
  );
  const seenProjectId = useRef(projectId);
  if (seenProjectId.current !== projectId) {
    seenProjectId.current = projectId;
    setSummary(projectId ? peekProjectSummary(projectId) : null);
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { silent?: boolean; fresh?: boolean }) => {
      if (!projectId || !online) {
        setSummary(null);
        setLoading(false);
        setError(null);
        return;
      }
      const fresh = Boolean(opts?.fresh);
      const known = fresh ? null : peekProjectSummary(projectId);
      if (known) setSummary(known);
      const silent = Boolean(opts?.silent) || known != null;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await loadProjectSummary(projectId, fresh);
        setSummary(data);
      } catch (err) {
        if (isProjectNotFound(err)) {
          clearActiveProjectIf(projectId, { notice: true });
          summarySlots.delete(projectId);
          setSummary(null);
          setError(null);
          return;
        }
        if (!silent) setSummary(null);
        setError(formatUserFacingErrorRequired(err, t));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [online, projectId, t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectId || !online) return;
    const id = window.setInterval(() => {
      void refresh({ silent: true });
    }, PROJECT_SUMMARY_POLL_MS);
    return () => window.clearInterval(id);
  }, [online, projectId, refresh]);

  const refreshPublic = useCallback(
    () => refresh({ silent: false, fresh: true }),
    [refresh],
  );

  return { summary, loading, error, refresh: refreshPublic };
}
