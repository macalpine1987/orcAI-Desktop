import type { LabDockProgressModel } from "../../hooks/useLabDockProgress";
import { JobProgressBar } from "../JobProgressBar";

/** Progress bar + files/%/duration for collapsed strip or expanded header. */
export function LabDockProgressCluster({
  model,
  showStatusText = false,
}: {
  model: LabDockProgressModel;
  /** When true, render statusText before the bar (expanded header). */
  showStatusText?: boolean;
}) {
  const {
    statusJob,
    statusText,
    showProgress,
    barPercent,
    forceIndeterminate,
    accentBatch,
    filesLabel,
    pctLabel,
    durationLabel,
  } = model;

  if (!showProgress && !showStatusText) {
    return null;
  }

  return (
    <div className="lab-dock-progress-cluster">
      {showStatusText ? (
        <span className="lab-dock-status-text lab-dock-status-text--header">
          {statusText}
        </span>
      ) : null}
      {showProgress ? (
        <>
          <JobProgressBar
            job={statusJob}
            variant="dock"
            percent={forceIndeterminate ? null : barPercent}
            forceIndeterminate={forceIndeterminate}
            accent={accentBatch ? "batch" : undefined}
          />
          {filesLabel ? (
            <span className="lab-dock-status-files">{filesLabel}</span>
          ) : null}
          {pctLabel ? (
            <span className="lab-dock-status-pct">{pctLabel}</span>
          ) : null}
          {durationLabel ? (
            <span className="lab-dock-status-duration">{durationLabel}</span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
