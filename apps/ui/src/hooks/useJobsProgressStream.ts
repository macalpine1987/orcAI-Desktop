import { useEffect, useRef } from "react";
import type { JobRecord } from "../api/jobs";
import {
  connectJobEventStream,
  isTerminalJobStatus,
  patchJobFromStream,
} from "../lib/jobEventStream";

type PatchFn = (jobId: string, patch: (job: JobRecord) => JobRecord) => void;

type Options = {
  online: boolean;
  enabled?: boolean;
  jobs: JobRecord[];
  onPatch: PatchFn;
  onTerminal?: (jobId: string) => void;
};

/**
 * SSE subscriptions for all running jobs — live progress in the jobs table.
 */
export function useJobsProgressStream({
  online,
  enabled = true,
  jobs,
  onPatch,
  onTerminal,
}: Options) {
  const onPatchRef = useRef(onPatch);
  const onTerminalRef = useRef(onTerminal);
  const jobsRef = useRef(jobs);
  onPatchRef.current = onPatch;
  onTerminalRef.current = onTerminal;
  jobsRef.current = jobs;

  const runningKey = jobs
    .filter((j) => j.status === "running")
    .map((j) => j.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!online || !enabled || !runningKey) return;

    const runningIds = runningKey.split(",").filter(Boolean);
    const closers = runningIds.map((jobId) => {
      const row = jobsRef.current.find((j) => j.id === jobId);
      const since = row?.log.length ?? 0;
      return connectJobEventStream(jobId, since, {
        onLog: (payload) => {
          onPatchRef.current(jobId, (current) =>
            patchJobFromStream(current, payload),
          );
        },
        onProgress: (payload) => {
          onPatchRef.current(jobId, (current) =>
            patchJobFromStream(current, payload),
          );
        },
        onStatus: (payload) => {
          onPatchRef.current(jobId, (current) => {
            const patched = patchJobFromStream(current, payload);
            if (isTerminalJobStatus(payload.status)) {
              onTerminalRef.current?.(jobId);
            }
            return patched;
          });
        },
        onSnapshot: (payload) => {
          onPatchRef.current(jobId, (current) => {
            const patched = patchJobFromStream(current, payload);
            if (isTerminalJobStatus(payload.status)) {
              onTerminalRef.current?.(jobId);
            }
            return patched;
          });
        },
      });
    });

    return () => {
      for (const close of closers) close();
    };
  }, [online, enabled, runningKey]);
}
