import { useCallback, useEffect, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  cancelJob,
  clearAllJobs,
  retryJob,
  type JobRecord,
} from "../api/jobs";
import { useLabJobOptional } from "../lab/LabJobContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { JobProgressBar } from "../components/JobProgressBar";
import { PageHelpButton } from "../components/PageHelpButton";
import { IconExport, IconTrash } from "../components/SpectrogramIcons";
import {
  formatDuration,
  formatJobTime,
  jobDurationSec,
  jobStatusI18nKey,
  type JobFilter,
} from "../lib/jobFormat";
import { exportJobLogToFile } from "../lib/jobLogExport";
import { revealJobResult } from "../lib/jobOpenResult";
import { jobTargetLabel } from "../lib/jobTargetLabel";
import { useJobsList } from "../hooks/useJobsList";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import {
  JOB_STATUS_PILL_CLASS,
  JobStatusDot,
} from "../lib/jobStatusDot";

const FILTERS: JobFilter[] = ["all", "active", "errors", "history"];

function JobStatusPill({ status }: { status: JobRecord["status"] }) {
  const { t } = useTranslation();
  return (
    <span className={clsx("job-status-pill", JOB_STATUS_PILL_CLASS[status])}>
      <JobStatusDot status={status} />
      {t(jobStatusI18nKey(status))}
    </span>
  );
}

export function JobsPage() {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const lab = useLabJobOptional();
  const {
    filtered,
    filter,
    setFilter,
    loading,
    error,
    refresh,
    failedJobs,
    jobs,
  } = useJobsList({ projectDir: null });
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const hasLiveDuration = jobs.some(
    (job) => job.status === "running" || job.status === "pending",
  );
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!hasLiveDuration) return;
    const id = window.setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, [hasLiveDuration]);

  const onSelectJob = (job: JobRecord) => {
    lab?.selectJob(job.id);
  };

  const runAction = async (
    e: MouseEvent,
    fn: () => Promise<void>,
  ) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await fn();
      await refresh();
      await lab?.refreshSelectedJob();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const onExportLog = useCallback(async () => {
    const job = lab?.selectedJob;
    if (!job) return;
    setActionError(null);
    try {
      const ok = await exportJobLogToFile(job);
      if (!ok) return;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [lab?.selectedJob]);

  const onClear = useCallback(() => {
    if (!online || jobs.length === 0) return;
    setConfirmClear(true);
  }, [online, jobs.length]);

  const onConfirmClear = useCallback(async () => {
    setClearBusy(true);
    setActionError(null);
    try {
      await clearAllJobs();
      setFilter("all");
      lab?.selectJob(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearBusy(false);
      setConfirmClear(false);
    }
  }, [lab, refresh, setFilter]);

  const tableColSpan = 7;

  return (
    <div className="jobs-page m16-jobs-studio">
      <div className="studio-panel jobs-work-panel">
        <div className="jobs-page-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-2xl font-semibold text-foreground">
                {t("pages.jobs.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                {t("pages.jobs.description")}
              </p>
            </div>
            <PageHelpButton />
          </div>
        </div>

        {!online && (
          <p className="jobs-work-panel-notice text-sm text-foreground-muted">
            {t("lab.sidecarNotConnected")}
          </p>
        )}

        {(error || actionError) && (
          <p className="jobs-work-panel-notice font-mono text-xs text-foreground">
            {error ?? actionError}
          </p>
        )}

        <div className="jobs-toolbar">
        <div className="jobs-toolbar-filters predict-tabs-m03" role="tablist" aria-label={t("nav.jobs")}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              className="predict-tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`jobs.filter.${f}`)}
            </button>
          ))}
          {filter === "errors" && failedJobs.length > 0 && (
            <span className="jobs-errors-hint">
              {t("jobs.errorsCount", { count: failedJobs.length })}
            </span>
          )}
        </div>
        <div className="jobs-toolbar-actions">
          <button
            type="button"
            onClick={onClear}
            disabled={!online || jobs.length === 0 || clearBusy}
            className="predict-results-page-btn predict-results-page-btn--filled"
          >
            <span className="predict-results-page-btn__icon" aria-hidden>
              <IconTrash />
            </span>
            {t("jobs.clear")}
          </button>
          <button
            type="button"
            disabled={!lab?.selectedJob}
            onClick={onExportLog}
            className="predict-results-page-btn predict-results-page-btn--filled"
          >
            <span className="predict-results-page-btn__icon" aria-hidden>
              <IconExport />
            </span>
            {t("jobs.exportLog")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t("jobs.clearConfirmTitle")}
        onClose={() => {
          if (!clearBusy) setConfirmClear(false);
        }}
      >
        <p className="mb-4 text-sm text-foreground-muted">
          {t("jobs.clearConfirmBody")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onConfirmClear()}
            disabled={clearBusy}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {t("jobs.clearConfirmAction")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(false)}
            disabled={clearBusy}
            className="mat-btn px-3 py-2 text-sm underline disabled:opacity-40"
          >
            {t("jobs.clearConfirmCancel")}
          </button>
        </div>
      </ConfirmDialog>

        <div className="jobs-table-body overflow-x-auto">
          <table className="jobs-table w-full min-w-[52rem] text-left">
            <thead>
              <tr>
                <th className="jobs-table-col-command">{t("jobs.colCommand")}</th>
                <th className="jobs-table-col-target">{t("jobs.colTarget")}</th>
                <th className="jobs-table-col-status">{t("jobs.colStatus")}</th>
                <th className="jobs-table-col-progress">{t("jobs.colProgress")}</th>
                <th className="jobs-table-col-started">{t("jobs.colStarted")}</th>
                <th className="jobs-table-col-duration">{t("jobs.colDuration")}</th>
                <th className="jobs-table-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="jobs-table-placeholder">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="jobs-table-placeholder">
                    {t("jobs.empty")}
                  </td>
                </tr>
              ) : (
                filtered.map((job) => {
                  const selected = lab?.selectedJobId === job.id;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => onSelectJob(job)}
                      className={clsx(
                        "jobs-table-row",
                        selected && "jobs-table-row-selected",
                      )}
                    >
                      <td className="jobs-table-col-command">
                        <span className="jobs-command-cell">
                          <JobStatusDot status={job.status} />
                          {/* Always CLI id (orcai predict), never localized UI name. */}
                          <span className="jobs-command-label">{job.command}</span>
                        </span>
                      </td>
                      <td className="jobs-table-col-target max-w-[12rem] truncate">
                        {jobTargetLabel(job)}
                      </td>
                      <td className="jobs-table-col-status">
                        <JobStatusPill status={job.status} />
                      </td>
                      <td className="jobs-table-col-progress">
                          <JobProgressBar job={job} />
                        </td>
                      <td className="jobs-table-col-started font-mono text-foreground-muted">
                        {job.status === "pending"
                          ? "—"
                          : formatJobTime(job.created_at)}
                      </td>
                      <td className="jobs-table-col-duration font-mono text-foreground-muted">
                        {job.status === "pending"
                          ? "—"
                          : formatDuration(jobDurationSec(job, nowSec))}
                      </td>
                      <td className="jobs-table-actions-col">
                        {job.status === "running" && (
                          <button
                            type="button"
                            onClick={(e) =>
                              void runAction(e, async () => {
                                await cancelJob(job.id);
                              })
                            }
                            className="jobs-action-link"
                          >
                            {t("jobs.action.cancel")}
                          </button>
                        )}
                        {job.status === "pending" && (
                          <button
                            type="button"
                            onClick={(e) =>
                              void runAction(e, async () => {
                                await cancelJob(job.id);
                              })
                            }
                            className="jobs-action-link"
                          >
                            {t("jobs.action.remove")}
                          </button>
                        )}
                        {job.status === "failed" && (
                          <button
                            type="button"
                            onClick={(e) =>
                              void runAction(e, async () => {
                                const retried = await retryJob(job.id);
                                lab?.selectJob(retried.id);
                              })
                            }
                            className="jobs-action-link"
                          >
                            {t("jobs.action.retry")}
                          </button>
                        )}
                        {job.status === "completed" && (
                          <button
                            type="button"
                            onClick={(e) =>
                              void runAction(e, async () => {
                                const ok = await revealJobResult(job);
                                if (!ok) {
                                  throw new Error(t("jobs.openNoResult"));
                                }
                              })
                            }
                            className="jobs-action-link"
                          >
                            {t("jobs.action.open")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
