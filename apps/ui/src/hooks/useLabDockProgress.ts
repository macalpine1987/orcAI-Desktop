import { useTranslation } from "react-i18next";
import type { JobRecord } from "../api/jobs";
import { useJobsListContext } from "./useJobsList";
import { useNowSec } from "./useNowSec";
import { useLabJobOptional } from "../lab/LabJobContext";
import { jobCommandLabel } from "../lib/jobCommandLabel";
import {
  formatDuration,
  isJobProgressIndeterminate,
  jobDurationSec,
  jobProgressPercent,
  jobStatusI18nKey,
} from "../lib/jobFormat";
import { predictBatchStripPercent } from "../lib/predictBatchStripProgress";
import { usePredictBatchOptional } from "../predict/PredictBatchContext";

export type LabDockProgressModel = {
  statusJob: JobRecord | null;
  statusText: string;
  showProgress: boolean;
  /** Resolved 0–100 for the bar; null → indeterminate when showProgress. */
  barPercent: number | null;
  forceIndeterminate: boolean;
  accentBatch: boolean;
  filesLabel: string | null;
  pctLabel: string | null;
  durationLabel: string | null;
  /** LED / status source */
  ledStatus: JobRecord["status"] | null;
  predictBatchActive: boolean;
};

/** Shared collapsed-strip / expanded-header progress for the Lab console. */
export function useLabDockProgress(options?: {
  /** When dock is expanded, idle text differs. */
  expanded?: boolean;
}): LabDockProgressModel {
  const { t } = useTranslation();
  const expanded = options?.expanded ?? false;
  const lab = useLabJobOptional();
  const { activeJob } = useJobsListContext();
  const predictBatch = usePredictBatchOptional();

  const statusJob = activeJob ?? lab?.selectedJob ?? null;
  const pct = statusJob ? jobProgressPercent(statusJob) : null;

  const predictBatchActive =
    predictBatch?.batchRunning === true &&
    predictBatch.batchProgress != null &&
    predictBatch.batchProgress.total > 0;

  const hasLiveDuration =
    statusJob?.status === "running" || predictBatchActive;
  const nowSec = useNowSec(Boolean(hasLiveDuration));

  const predictBatchProgress =
    predictBatchActive && predictBatch?.batchProgress
      ? predictBatch.batchProgress
      : null;

  const predictStripPct =
    predictBatchProgress != null
      ? predictBatchStripPercent(
          predictBatchProgress.done,
          predictBatchProgress.total,
          statusJob?.command === "predict" && statusJob.status === "running"
            ? pct
            : null,
        )
      : null;

  let statusText = expanded
    ? t("lab.dockStatusOpen")
    : t("lab.dockStatusClosed");
  if (predictBatchActive) {
    statusText = t("lab.dockPredictRunning");
  } else if (
    statusJob?.command === "import-audio" &&
    (statusJob.status === "running" || statusJob.status === "pending")
  ) {
    statusText = t("lab.importAudioRunning");
  } else if (statusJob) {
    statusText = `${jobCommandLabel(statusJob.command, t)} · ${t(jobStatusI18nKey(statusJob.status))}`;
  }

  const importPaths = Array.isArray(statusJob?.params?.paths)
    ? (statusJob.params.paths as unknown[])
    : [];
  const importTotal =
    statusJob?.command === "import-audio" && importPaths.length > 0
      ? importPaths.length
      : 0;
  const importDone =
    importTotal > 0 && pct != null
      ? Math.min(importTotal, Math.round((pct / 100) * importTotal))
      : null;

  const showProgress = predictBatchActive
    ? predictStripPct != null
    : statusJob != null &&
      statusJob.status === "running" &&
      (pct != null || isJobProgressIndeterminate(statusJob));

  const barPercent = predictBatchActive
    ? (predictStripPct ?? 0)
    : pct;

  const forceIndeterminate =
    !predictBatchActive &&
    statusJob != null &&
    statusJob.status === "running" &&
    isJobProgressIndeterminate(statusJob);

  const accentBatch = predictBatchActive || importTotal > 0;

  let filesLabel: string | null = null;
  if (predictBatchProgress) {
    filesLabel = t("lab.dockFiles", {
      done: Math.min(
        predictBatchProgress.total,
        Math.floor(predictBatchProgress.done),
      ),
      total: predictBatchProgress.total,
    });
  } else if (importDone != null && importTotal > 0) {
    filesLabel = t("lab.dockFiles", {
      done: importDone,
      total: importTotal,
    });
  }

  const pctLabel =
    !predictBatchActive && !filesLabel && pct != null ? `${pct}%` : null;

  const durationLabel =
    statusJob?.status === "running"
      ? formatDuration(jobDurationSec(statusJob, nowSec))
      : null;

  const ledStatus: JobRecord["status"] | null = predictBatchActive
    ? "running"
    : (statusJob?.status ?? null);

  return {
    statusJob,
    statusText,
    showProgress,
    barPercent,
    forceIndeterminate,
    accentBatch,
    filesLabel,
    pctLabel,
    durationLabel,
    ledStatus,
    predictBatchActive,
  };
}
