import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobLogSince, type JobRecord } from "../api/jobs";
import {
  connectJobEventStream,
  isTerminalJobStatus,
  patchJobFromStream,
} from "../lib/jobEventStream";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Tail job log via SSE `/v1/jobs/{id}/events`, poll fallback on error. */
export function useJobLogTail(job: JobRecord | null, online: boolean) {
  const [lines, setLines] = useState<string[]>([]);
  const sinceRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);

  const reset = useCallback((initial: string[]) => {
    sinceRef.current = initial.length;
    setLines(initial);
  }, []);

  useEffect(() => {
    if (!job) {
      sinceRef.current = 0;
      jobIdRef.current = null;
      setLines([]);
      return;
    }
    if (jobIdRef.current !== job.id) {
      jobIdRef.current = job.id;
      reset(job.log);
      return;
    }
    // Catch up when Lab merges a fuller snapshot (import-audio race).
    if (job.log.length > sinceRef.current) {
      setLines(job.log);
      sinceRef.current = job.log.length;
    }
  }, [job, reset]);

  useEffect(() => {
    if (!job || !online) return;

    let closed = false;
    let unsubscribe: (() => void) | null = null;
    let pollTimer: number | null = null;
    const jobId = job.id;
    const terminal = TERMINAL.has(job.status);

    const pollOnce = async () => {
      const from = sinceRef.current;
      try {
        const slice = await fetchJobLogSince(jobId, from);
        if (closed) return;
        if (slice.lines.length > 0) {
          setLines((prev) => {
            // SSE may already have appended these lines while this request was in flight.
            const overlap = Math.max(0, prev.length - from);
            const fresh = slice.lines.slice(overlap);
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
        }
        sinceRef.current = Math.max(sinceRef.current, slice.next_since);
      } catch {
        // keep last lines on transient errors
      }
    };

    const startPollFallback = () => {
      if (pollTimer != null) return;
      void pollOnce();
      if (terminal || TERMINAL.has(job.status)) return;
      pollTimer = window.setInterval(() => {
        if (TERMINAL.has(job.status)) {
          if (pollTimer != null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          return;
        }
        void pollOnce();
      }, 1500);
    };

    const connect = () => {
      unsubscribe?.();
      unsubscribe = connectJobEventStream(jobId, sinceRef.current, {
        onLog: (payload) => {
          // Advance before React applies setLines. Completion polls in the same
          // turn and would otherwise re-fetch the line just shown.
          if (typeof payload.index === "number") {
            sinceRef.current = Math.max(sinceRef.current, payload.index + 1);
          }
          setLines((prev) =>
            patchJobFromStream(
              { id: jobId, status: "running", log: prev } as JobRecord,
              payload,
            ).log,
          );
        },
        onSnapshot: (payload) => {
          if (typeof payload.next_since === "number") {
            sinceRef.current = payload.next_since;
          }
          if (isTerminalJobStatus(payload.status)) {
            unsubscribe?.();
            unsubscribe = null;
          }
        },
        onStatus: (payload) => {
          if (isTerminalJobStatus(payload.status)) {
            unsubscribe?.();
            unsubscribe = null;
            void pollOnce();
          }
        },
        onError: () => {
          unsubscribe?.();
          unsubscribe = null;
          startPollFallback();
        },
      });
    };

    connect();

    return () => {
      closed = true;
      unsubscribe?.();
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
    // Reconnect only when the selected job changes — not on every log/status patch.
  }, [online, job?.id]);

  return lines;
}
