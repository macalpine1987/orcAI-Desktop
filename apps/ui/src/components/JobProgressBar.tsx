import clsx from "clsx";
import type { JobRecord } from "../api/jobs";
import {
  isJobProgressIndeterminate,
  jobProgressPercent,
} from "../lib/jobFormat";

type JobProgressBarProps = {
  job: JobRecord;
  /** `table` — m16 jobs grid; `dock` — collapsed console strip */
  variant?: "table" | "dock";
  /** Force indeterminate (e.g. batch predict at 0/N files). */
  forceIndeterminate?: boolean;
  percent?: number | null;
  accent?: "batch";
  className?: string;
};

export function JobProgressBar({
  job,
  variant = "table",
  forceIndeterminate = false,
  percent,
  accent,
  className,
}: JobProgressBarProps) {
  const pct = percent ?? jobProgressPercent(job);
  const indeterminate =
    forceIndeterminate ||
    (job.status === "running" && isJobProgressIndeterminate(job));

  const tone =
    job.status === "failed"
      ? "job-progress-fill--failed"
      : job.status === "completed"
        ? "job-progress-fill--completed"
        : job.status === "running"
          ? "job-progress-fill--running"
          : "job-progress-fill--pending";

  const trackClass =
    variant === "dock"
      ? "lab-dock-status-progress-track"
      : "job-progress-track";
  const fillClass =
    variant === "dock"
      ? "lab-dock-status-progress-fill"
      : "job-progress-fill";

  return (
    <div
      className={clsx(
        variant === "table" && "job-progress-cell",
        className,
      )}
    >
      <div
        className={clsx(
          trackClass,
          indeterminate && "progress-track--indeterminate",
        )}
        aria-hidden={variant === "dock" ? true : undefined}
        role={indeterminate ? "progressbar" : undefined}
        aria-valuemin={indeterminate ? 0 : undefined}
        aria-valuemax={indeterminate ? 100 : undefined}
        aria-busy={indeterminate ? true : undefined}
      >
        <div
          className={clsx(
            fillClass,
            tone,
            indeterminate && "progress-fill--indeterminate",
            accent === "batch" && "lab-dock-status-progress-fill--batch",
          )}
          style={indeterminate ? undefined : { width: pct != null ? `${pct}%` : "0%" }}
        />
      </div>
    </div>
  );
}
