import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchJob, type JobRecord } from "../api/jobs";
import { useJobsListOptional } from "../jobs/JobsListContext";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { mergeJobRecords, pickActiveJob } from "../lib/jobFormat";

export type LabDockTab = "log" | "inspector" | "errors" | "command";

type LabJobContextValue = {
  selectedJobId: string | null;
  selectedJob: JobRecord | null;
  selectJob: (id: string | null) => void;
  refreshSelectedJob: () => Promise<void>;
  dockTab: LabDockTab;
  setDockTab: (tab: LabDockTab) => void;
};

const LabJobContext = createContext<LabJobContextValue | null>(null);

export function LabJobProvider({ children }: { children: ReactNode }) {
  const { online } = useSidecarStatus();
  const jobsList = useJobsListOptional();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [dockTab, setDockTab] = useState<LabDockTab>("log");
  /** When true, dock sticks to a user pick and does not auto-follow the queue. */
  const [selectionPinned, setSelectionPinned] = useState(false);

  const selectJob = useCallback((id: string | null) => {
    setSelectedJobId(id);
    setSelectionPinned(Boolean(id));
    if (id) setDockTab("log");
  }, []);

  const refreshSelectedJob = useCallback(async () => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }
    if (!online) {
      setSelectedJob(null);
      return;
    }
    try {
      setSelectedJob(await fetchJob(selectedJobId));
    } catch {
      setSelectedJob(null);
    }
  }, [selectedJobId, online]);

  useEffect(() => {
    void refreshSelectedJob();
  }, [selectedJobId, refreshSelectedJob]);

  /** Keep dock selection in sync with SSE-patched jobs list (never shrink log / regress status). */
  useEffect(() => {
    if (!selectedJobId) return;
    const fromList = jobsList?.jobs.find((j) => j.id === selectedJobId);
    if (!fromList) return;
    setSelectedJob((prev) =>
      prev && prev.id === fromList.id ? mergeJobRecords(prev, fromList) : fromList,
    );
  }, [selectedJobId, jobsList?.jobs]);

  /**
   * Follow the job that is actually executing (or next in FIFO queue).
   * Wizard/pipeline enqueue many jobs at once; trackJobInLab would otherwise
   * leave the dock on the last pending command (e.g. test) while another runs.
   */
  useEffect(() => {
    const jobs = jobsList?.jobs;
    if (!jobs?.length) return;
    const active = pickActiveJob(jobs);
    if (!active) {
      if (selectionPinned) setSelectionPinned(false);
      return;
    }
    if (selectionPinned) {
      const pinned = jobs.find((j) => j.id === selectedJobId);
      // Keep pin only while that job is still in the active queue.
      if (
        pinned &&
        (pinned.status === "pending" || pinned.status === "running")
      ) {
        return;
      }
      setSelectionPinned(false);
    }
    if (active.id !== selectedJobId) {
      setSelectedJobId(active.id);
      setDockTab("log");
    }
  }, [jobsList?.jobs, selectedJobId, selectionPinned]);

  const value = useMemo(
    () => ({
      selectedJobId,
      selectedJob,
      selectJob,
      refreshSelectedJob,
      dockTab,
      setDockTab,
    }),
    [selectedJobId, selectedJob, selectJob, refreshSelectedJob, dockTab],
  );

  return (
    <LabJobContext.Provider value={value}>{children}</LabJobContext.Provider>
  );
}

export function useLabJob() {
  const ctx = useContext(LabJobContext);
  if (!ctx) {
    throw new Error("useLabJob must be used within LabJobProvider");
  }
  return ctx;
}

export function useLabJobOptional() {
  return useContext(LabJobContext);
}
