import { getSidecarBase } from "../api/sidecar";
import type { JobRecord } from "../api/jobs";

export type JobStreamPayload = {
  type: string;
  job_id?: string;
  progress?: number | null;
  status?: string;
  line?: string;
  index?: number;
  exit_code?: number | null;
  error?: string | null;
  next_since?: number;
  /** Unix seconds when the worker actually started (excludes queue wait). */
  started_at?: number | null;
};

export type JobStreamHandlers = {
  onLog?: (payload: JobStreamPayload) => void;
  onProgress?: (payload: JobStreamPayload) => void;
  onStatus?: (payload: JobStreamPayload) => void;
  onSnapshot?: (payload: JobStreamPayload) => void;
  onPing?: (payload: JobStreamPayload) => void;
  onError?: () => void;
};

const STREAM_EVENT_TYPES = ["log", "progress", "status", "snapshot", "ping"] as const;

const TERMINAL = new Set<JobRecord["status"]>([
  "completed",
  "failed",
  "cancelled",
]);

export function jobEventsUrl(jobId: string, since = 0): string {
  const url = new URL(
    `${getSidecarBase()}/v1/jobs/${encodeURIComponent(jobId)}/events`,
  );
  url.searchParams.set("since", String(Math.max(0, since)));
  return url.toString();
}

export function parseJobStreamPayload(data: string): JobStreamPayload | null {
  try {
    const parsed = JSON.parse(data) as JobStreamPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isJobStatus(value: string): value is JobRecord["status"] {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

/** Merge SSE payload into a job row (table / dock). */
export function patchJobFromStream(
  job: JobRecord,
  payload: JobStreamPayload,
): JobRecord {
  const next: JobRecord = { ...job };

  if (payload.status && isJobStatus(payload.status)) {
    next.status = payload.status;
  }
  if (payload.progress !== undefined) {
    next.progress = payload.progress;
  }
  if (payload.exit_code !== undefined && payload.exit_code !== null) {
    next.exit_code = payload.exit_code;
  }
  if (payload.error !== undefined && payload.error !== null) {
    next.error = payload.error;
  }
  if (
    typeof payload.started_at === "number" &&
    Number.isFinite(payload.started_at)
  ) {
    next.started_at = payload.started_at;
  }

  if (payload.type === "log" && typeof payload.line === "string") {
    const idx = payload.index;
    if (typeof idx === "number") {
      if (idx === next.log.length) {
        next.log = [...next.log, payload.line];
      } else if (idx < next.log.length && next.log[idx] !== payload.line) {
        const log = [...next.log];
        log[idx] = payload.line;
        next.log = log;
      }
    }
  }

  if (next.status === "completed" && next.progress == null) {
    next.progress = 1;
  }

  return next;
}

export function isTerminalJobStatus(
  status: string | undefined,
): status is JobRecord["status"] {
  return status != null && TERMINAL.has(status as JobRecord["status"]);
}

/** Subscribe to `/v1/jobs/{id}/events`. Returns unsubscribe. */
export function connectJobEventStream(
  jobId: string,
  since: number,
  handlers: JobStreamHandlers,
): () => void {
  const es = new EventSource(jobEventsUrl(jobId, since));

  const dispatch = (eventType: string, ev: MessageEvent<string>) => {
    const payload = parseJobStreamPayload(ev.data);
    if (!payload) return;
    switch (eventType) {
      case "log":
        handlers.onLog?.(payload);
        break;
      case "progress":
        handlers.onProgress?.(payload);
        break;
      case "status":
        handlers.onStatus?.(payload);
        break;
      case "snapshot":
        handlers.onSnapshot?.(payload);
        break;
      case "ping":
        handlers.onPing?.(payload);
        break;
      default:
        break;
    }
  };

  for (const eventType of STREAM_EVENT_TYPES) {
    es.addEventListener(eventType, (ev) =>
      dispatch(eventType, ev as MessageEvent<string>),
    );
  }

  es.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    es.close();
  };
}
