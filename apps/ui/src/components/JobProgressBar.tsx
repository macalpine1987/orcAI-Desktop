import clsx from "clsx";
import type { JobRecord } from "../api/jobs";
import {
  isJobProgressIndeterminate,
  jobProgressPercent,
} from "../lib/jobFormat";

type JobProgressBarProps = {
  /** Omit when only `percent` / forceIndeterminate drive the bar (batch strip). */
  job?: JobRecord | null;
  /** `table` — m16 jobs grid; `dock` — console strip / header */
  variant?: "table" | "dock";
  /** Force indeterminate (e.g. running without numeric progress). */
  forceIndeterminate?: boolean;
  percent?: number | null;
  accent?: "batch";
  className?: string;
};

export function JobProgressBar({
  job = null,
  variant = "table",
  forceIndeterminate = false,
  percent,
  accent,
  className,
}: JobProgressBarProps) {
  const fromJob = job ? jobProgressPercent(job) : null;
  const pct = percent !== undefined ? percent : fromJob;
  const indeterminate =
    forceIndeterminate ||
    (job != null &&
      job.status === "running" &&
      percent === undefined &&
      isJobProgressIndeterminate(job)) ||
    (job == null && forceIndeterminate) ||
    (job == null && (pct == null || Number.isNaN(pct)));

  const status = job?.status ?? "running";
  const tone =
    status === "failed"
      ? "job-progress-fill--failed"
      : status === "completed"
        ? "job-progress-fill--completed"
        : status === "running"
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
            // Dock: quiet static stub (old console look). Table/monitor: sliding bar.
            indeterminate &&
              (variant === "dock"
                ? "progress-fill--indeterminate-static"
                : "progress-fill--indeterminate"),
            accent === "batch" && "lab-dock-status-progress-fill--batch",
          )}
          style={
            indeterminate
              ? undefined
              : { width: pct != null ? `${pct}%` : "0%" }
          }
        />
      </div>
    </div>
  );
}
