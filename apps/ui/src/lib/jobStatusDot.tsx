import clsx from "clsx";
import type { JobRecord } from "../api/jobs";

/** Full class strings — must stay literal for Tailwind production purge. */
export const JOB_STATUS_DOT_CLASS = {
  running: "jobs-status-dot--running",
  pending: "jobs-status-dot--pending",
  completed: "jobs-status-dot--completed",
  failed: "jobs-status-dot--failed",
  cancelled: "jobs-status-dot--cancelled",
} as const satisfies Record<JobRecord["status"], string>;

export const JOB_STATUS_PILL_CLASS = {
  running: "job-status-pill--running",
  pending: "job-status-pill--pending",
  completed: "job-status-pill--completed",
  failed: "job-status-pill--failed",
  cancelled: "job-status-pill--cancelled",
} as const satisfies Record<JobRecord["status"], string>;

export function JobStatusDot({ status }: { status: JobRecord["status"] }) {
  return (
    <span
      className={clsx("jobs-status-dot", JOB_STATUS_DOT_CLASS[status])}
      aria-hidden
    />
  );
}
