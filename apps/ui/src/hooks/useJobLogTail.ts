import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobLogSince, type JobRecord } from "../api/jobs";
import {
  connectJobEventStream,
  isTerminalJobStatus,
  patchJobFromStream,
} from "../lib/jobEventStream";
import { jobLogNextSince, trimJobLogLines } from "../lib/jobLogTail";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Tail job log via SSE `/v1/jobs/{id}/events`, poll fallback on error. */
export function useJobLogTail(job: JobRecord | null, online: boolean) {
  const [lines, setLines] = useState<string[]>([]);
  const sinceRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);

  const reset = useCallback(
    (initial: string[], nextSince: number) => {
      sinceRef.current = nextSince;
      setLines(trimJobLogLines(initial));
    },
    [],
  );

  useEffect(() => {
    if (!job) {
      sinceRef.current = 0;
      jobIdRef.current = null;
      setLines([]);
      return;
    }
    if (jobIdRef.current !== job.id) {
      jobIdRef.current = job.id;
      reset(job.log, jobLogNextSince(job));
      return;
    }
    // Catch up when Lab merges a fuller snapshot (import-audio race).
    const absLen = jobLogNextSince(job);
    if (absLen > sinceRef.current) {
      setLines(trimJobLogLines(job.log));
      sinceRef.current = absLen;
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
        // Snapshot before advancing: setLines may run after next_since is applied.
        const caughtUpTo = sinceRef.current;
        if (slice.lines.length > 0) {
          setLines((prev) => {
            // SSE may already have appended some of these while the request was in flight.
            const already = Math.max(0, caughtUpTo - from);
            const fresh = slice.lines.slice(already);
            if (fresh.length === 0) return prev;
            return trimJobLogLines([...prev, ...fresh]);
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
          // Advance the absolute cursor before setLines so a same-turn
          // completion poll does not re-fetch this line. Window base must use
          // the pre-advance cursor, or patchJobFromStream treats the event as
          // an in-window replace and drops the seed line.
          const prevSince = sinceRef.current;
          if (typeof payload.index === "number") {
            sinceRef.current = Math.max(sinceRef.current, payload.index + 1);
          }
          setLines((prev) => {
            const base = Math.max(0, prevSince - prev.length);
            return patchJobFromStream(
              {
                id: jobId,
                status: "running",
                log: prev,
                log_base: base,
              } as JobRecord,
              payload,
            ).log;
          });
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
