import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchJobs, type JobRecord } from "../api/jobs";
import { useJobsProgressStream } from "../hooks/useJobsProgressStream";
import {
  jobsListsDisplayEqual,
  mergeJobRecords,
  pickActiveJob,
  sortJobsNewestFirst,
} from "../lib/jobFormat";
import { stripJobLogForListPoll } from "../lib/jobLogTail";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import { jobMatchesProjectDir } from "../lib/jobProjectScope";
import { JOBS_LIST_POLL_MS } from "../lib/pollIntervals";
import { isTauri } from "../platform/tauri";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";

async function listen<T>(event: string, handler: (event: { payload: T }) => void) {
  const { listen: listenEvent } = await import("@tauri-apps/api/event");
  return listenEvent<T>(event, handler);
}

type JobsListContextValue = {
  projectDir: string | null;
  jobs: JobRecord[];
  failedJobs: JobRecord[];
  activeJob: JobRecord | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertJob: (job: JobRecord) => void;
  clearLocalJobs: () => void;
};

const JobsListContext = createContext<JobsListContextValue | null>(null);

type JobsListProviderProps = {
  children: ReactNode;
  /** When set, only jobs for this project dir; omit for full history. */
  projectDir?: string | null;
  pollMs?: number;
};

export function JobsListProvider({
  children,
  projectDir: projectDirProp,
  pollMs = JOBS_LIST_POLL_MS,
}: JobsListProviderProps) {
  const workspace = useWorkspace();
  const activeProjectDir =
    workspace.activeProjectId && workspace.projectDir ? workspace.projectDir : null;
  const projectDir = projectDirProp !== undefined ? projectDirProp : activeProjectDir;
  const { online } = useSidecarStatus();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const requestRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Keep last list during engine start / brief offline so tables do not remount. */
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const scopeRef = useRef(projectDir);
  /** True after first successful fetch for the current project scope (incl. empty). */
  const hydratedRef = useRef(false);

  const upsertJob = useCallback((job: JobRecord) => {
    if (!jobMatchesProjectDir(job.params, projectDir)) return;
    setJobs((prev) => {
      const idx = prev.findIndex((row) => row.id === job.id);
      if (idx === -1) {
        return sortJobsNewestFirst([job, ...prev]);
      }
      const next = [...prev];
      next[idx] = mergeJobRecords(next[idx]!, job);
      return sortJobsNewestFirst(next);
    });
  }, [projectDir]);

  const clearLocalJobs = useCallback(() => {
    hydratedRef.current = false;
    setJobs([]);
    setError(null);
  }, []);

  const patchJobInList = useCallback(
    (jobId: string, patch: (job: JobRecord) => JobRecord) => {
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx === -1) return prev;
        const patched = patch(prev[idx]!);
        if (
          jobsListsDisplayEqual([prev[idx]!], [patched]) &&
          prev[idx]!.log === patched.log &&
          prev[idx]!.result === patched.result
        ) {
          return prev;
        }
        const next = [...prev];
        next[idx] = patched;
        return next;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    if (scopeRef.current !== projectDir) {
      scopeRef.current = projectDir;
      jobsRef.current = [];
      hydratedRef.current = false;
      setJobs([]);
    }
    if (!projectDir) {
      hydratedRef.current = false;
      setJobs([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!online) {
      // Do not wipe jobs — clearing forced HomeRecentJobs / JobsPage to swap the
      // whole table for an offline/loading placeholder (graphic flicker on start).
      setLoading(false);
      return;
    }
    // Empty list used to re-enter loading on every poll → Home «нет задач» flickered.
    const showLoading = !hydratedRef.current;
    if (showLoading) setLoading(true);
    // Avoid a no-op error clear that still churns subscribers on every poll.
    setError((prev) => (prev == null ? prev : null));
    try {
      const list = await fetchJobs(projectDir);
      if (request !== requestRef.current) return;
      // List payloads should not retain full logs in React state; keep a short
      // tail (or empty) then merge so SSE / dock rings survive the poll.
      const sorted = sortJobsNewestFirst(list).map((job) =>
        stripJobLogForListPoll(job),
      );
      setJobs((prev) => {
        const prevById = new Map(prev.map((job) => [job.id, job]));
        const merged = sorted.map((job) => {
          const old = prevById.get(job.id);
          return old ? mergeJobRecords(old, job) : job;
        });
        return jobsListsDisplayEqual(prev, merged) ? prev : merged;
      });
      hydratedRef.current = true;
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(formatUserFacingErrorI18n(e));
    } finally {
      if (request === requestRef.current && showLoading) setLoading(false);
    }
  }, [online, projectDir]);

  useJobsProgressStream({
    online,
    jobs,
    onPatch: patchJobInList,
    onTerminal: () => {
      void refresh();
    },
  });

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<string>("sidecar-exited", () => {
      setJobs((prev) =>
        prev.map((job) =>
          job.status === "running" || job.status === "pending"
            ? {
                ...job,
                status: "cancelled",
                error: formatUserFacingErrorI18n("Sidecar process exited"),
                exit_code: 130,
              }
            : job,
        ),
      );
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((err) => {
        // SSE listen is best-effort; jobs still poll.
        if (import.meta.env.DEV) {
          console.warn("[silent:jobsProgressListen]", err);
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const hasActiveJobs = useMemo(
    () =>
      jobs.some(
        (job) => job.status === "running" || job.status === "pending",
      ),
    [jobs],
  );

  useEffect(() => {
    void refresh();
    if (!online) return;
    // Idle: rare poll. Active: rely on SSE; poll only as a slow safety net.
    const intervalMs = hasActiveJobs ? JOBS_LIST_POLL_MS : pollMs;
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [online, refresh, pollMs, hasActiveJobs]);

  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === "failed"),
    [jobs],
  );

  const activeJob = useMemo(() => pickActiveJob(jobs), [jobs]);

  const value = useMemo(
    () => ({
      projectDir,
      jobs,
      failedJobs,
      activeJob,
      loading,
      error,
      refresh,
      upsertJob,
      clearLocalJobs,
    }),
    [projectDir, jobs, failedJobs, activeJob, loading, error, refresh, upsertJob, clearLocalJobs],
  );

  return (
    <JobsListContext.Provider value={value}>{children}</JobsListContext.Provider>
  );
}

export function useJobsListContext(): JobsListContextValue {
  const ctx = useContext(JobsListContext);
  if (!ctx) {
    throw new Error("useJobsListContext requires JobsListProvider");
  }
  return ctx;
}

export function useJobsListOptional(): JobsListContextValue | null {
  return useContext(JobsListContext);
}
