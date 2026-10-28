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
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { isTauri } from "../platform/tauri";

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
  projectDir = null,
  pollMs = 5000,
}: JobsListProviderProps) {
  const { online } = useSidecarStatus();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Keep last list during engine start / brief offline so tables do not remount. */
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const upsertJob = useCallback((job: JobRecord) => {
    setJobs((prev) => {
      const idx = prev.findIndex((row) => row.id === job.id);
      if (idx === -1) {
        return sortJobsNewestFirst([job, ...prev]);
      }
      const next = [...prev];
      next[idx] = mergeJobRecords(next[idx]!, job);
      return sortJobsNewestFirst(next);
    });
  }, []);

  const clearLocalJobs = useCallback(() => {
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
    if (!online) {
      // Do not wipe jobs — clearing forced HomeRecentJobs / JobsPage to swap the
      // whole table for an offline/loading placeholder (graphic flicker on start).
      setLoading(false);
      return;
    }
    const initialLoad = jobsRef.current.length === 0;
    if (initialLoad) setLoading(true);
    setError(null);
    try {
      const list = await fetchJobs(projectDir ?? undefined);
      const sorted = sortJobsNewestFirst(list);
      setJobs((prev) => (jobsListsDisplayEqual(prev, sorted) ? prev : sorted));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (initialLoad) setLoading(false);
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
    void listen<string>("sidecar-exited", () => {
      setJobs((prev) =>
        prev.map((job) =>
          job.status === "running" || job.status === "pending"
            ? {
                ...job,
                status: "cancelled",
                error: "Sidecar process exited",
                exit_code: 130,
              }
            : job,
        ),
      );
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => undefined);
    return () => {
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
    const intervalMs = hasActiveJobs ? 5_000 : pollMs;
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
