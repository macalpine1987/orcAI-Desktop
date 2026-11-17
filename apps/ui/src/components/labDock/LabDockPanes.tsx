import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { retryJob } from "../../api/jobs";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import { useJobsListContext } from "../../hooks/useJobsList";
import { useJobLogTail } from "../../hooks/useJobLogTail";
import { formatUserFacingErrorRequired } from "../../lib/userFacingError";
import {
  useLabJobOptional,
  type LabDockTab,
} from "../../lab/LabJobContext";
import { jobCommandLabel } from "../../lib/jobCommandLabel";
import { copyText } from "../../lib/jobLogExport";
import { useSaveNotice } from "../../ui/saveNotice";
import { formatJobTime } from "../../lib/jobFormat";
import { jobTargetLabel } from "../../lib/jobTargetLabel";
import {
  HighlightedJson,
  labLogLineIndentPx,
  labLogLineTone,
} from "../../lib/labDockHighlight";
import type { JobRecord } from "../../api/jobs";
import { COPY_FEEDBACK_MS } from "../../lib/timeouts";

export function JobLogPaneBody() {
  const { t } = useTranslation();
  const { online, engineStatus } = useSidecarStatus();
  const lab = useLabJobOptional();
  const job = lab?.selectedJob ?? null;
  const lines = useJobLogTail(job, online);

  return (
    <div className="lab-dock-log-pre" role="log">
      {!online
        ? t("lab.sidecarNotConnected")
        : engineStatus === "warming"
          ? t("home.engineWarming")
          : job
            ? lines.length > 0
              ? lines.map((line, index) => (
                  <div
                    key={index}
                    className={clsx(
                      "lab-dock-log-line",
                      `lab-dock-log-line--${labLogLineTone(line)}`,
                    )}
                    style={{ paddingLeft: labLogLineIndentPx(line) }}
                  >
                    {line.trimStart() || "\u00a0"}
                  </div>
                ))
              : t("lab.noLogs")
            : t("lab.selectJob")}
    </div>
  );
}

export function JobInspectorParamsBody() {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const job = lab?.selectedJob;

  if (!job) {
    return (
      <p className="font-sans text-foreground-muted">{t("lab.inspectorHint")}</p>
    );
  }

  return (
    <pre className="lab-dock-inspector-json">
      <HighlightedJson data={job.params} />
    </pre>
  );
}

export function JobInspectorPaneBody() {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const job = lab?.selectedJob;

  if (!job) {
    return (
      <p className="font-sans text-foreground-muted">{t("lab.inspectorHint")}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-foreground-muted">
          {jobCommandLabel(job.command, t)} · {jobTargetLabel(job)}
        </p>
        <p className="text-[10px] text-foreground-muted">{job.id}</p>
      </div>
      {job.error && (
        <p className="whitespace-pre-wrap font-sans text-foreground">
          {formatUserFacingErrorRequired(job.error, t)}
        </p>
      )}
      <div>
        <p className="mb-1 font-sans text-[10px] uppercase tracking-wide text-foreground-muted">
          {t("lab.params")}
        </p>
        <pre className="mat-inset rounded p-2 text-[10px] text-foreground-muted">
          {JSON.stringify(job.params, null, 2)}
        </pre>
      </div>
      {job.result != null && (
        <div>
          <p className="mb-1 font-sans text-[10px] uppercase tracking-wide text-foreground-muted">
            {t("lab.result")}
          </p>
          <pre className="mat-inset rounded p-2 text-[10px] text-foreground-muted">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function JobErrorsPaneBody() {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const { failedJobs, refresh } = useJobsListContext();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  type ErrorEntry = {
    id: string;
    job: JobRecord;
    level: "error" | "warning";
    message: string;
    time: number;
  };

  const entries: ErrorEntry[] = failedJobs.flatMap((job) => {
    const rows: ErrorEntry[] = [];
    if (job.error) {
      rows.push({
        id: `${job.id}:error`,
        job,
        level: "error",
        message: formatUserFacingErrorRequired(job.error, t),
        time: job.updated_at,
      });
    }
    job.log?.forEach((line, index) => {
      if (/warn/i.test(line)) {
        rows.push({
          id: `${job.id}:warn:${index}`,
          job,
          level: "warning",
          message: line,
          time: job.updated_at,
        });
      }
    });
    return rows;
  });

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedEntryId(null);
      return;
    }
    if (!selectedEntryId || !entries.some((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(entries[0]!.id);
    }
  }, [entries, selectedEntryId]);

  const selectedEntry =
    entries.find((e) => e.id === selectedEntryId) ?? entries[0] ?? null;
  const selectedJob = selectedEntry?.job ?? null;

  const onGoToJob = () => {
    if (!selectedJob) return;
    lab?.selectJob(selectedJob.id);
    lab?.setDockTab("inspector");
  };

  const onRetry = async () => {
    if (!selectedJob || retryBusy) return;
    setRetryBusy(true);
    setRetryError(null);
    try {
      const retried = await retryJob(selectedJob.id);
      await refresh();
      lab?.selectJob(retried.id);
      lab?.setDockTab("log");
    } catch (err) {
      setRetryError(formatUserFacingErrorRequired(err, t));
    } finally {
      setRetryBusy(false);
    }
  };

  if (failedJobs.length === 0) {
    return (
      <p className="font-sans text-sm text-foreground-muted">
        {t("lab.noErrors")}
      </p>
    );
  }

  return (
    <div className="lab-errors-split">
      <section className="flex min-h-0 flex-col gap-2">
        <h3 className="lab-console-heading">{t("lab.errorsListTitle")}</h3>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setSelectedEntryId(entry.id)}
                className={clsx(
                  "lab-errors-list-item",
                  selectedEntry?.id === entry.id && "lab-errors-list-item-selected",
                )}
              >
                <span
                  className={clsx(
                    "lab-error-dot",
                    entry.level === "warning" && "lab-error-dot--warning",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] text-foreground-muted">
                    {formatJobTime(entry.time)}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs text-foreground">
                    {jobCommandLabel(entry.job.command, t)} ·{" "}
                    {jobTargetLabel(entry.job)}
                  </span>
                  <span
                    className={clsx(
                      "mt-1 block whitespace-pre-wrap font-sans text-[11px] leading-relaxed",
                      entry.level === "error"
                        ? "text-red-400/95"
                        : "text-amber-300/90",
                    )}
                  >
                    {entry.message}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-0 flex-col gap-2 border-l border-border pl-3 max-sm:border-l-0 max-sm:pl-0 max-sm:pt-2 max-sm:border-t">
        <h3 className="lab-console-heading">{t("lab.errorsDetailTitle")}</h3>
        {selectedJob ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="lab-errors-detail-title">{jobTargetLabel(selectedJob)}</p>
            <p className="lab-errors-detail-stage">
              {t("lab.errorsStage", {
                command: jobCommandLabel(selectedJob.command, t),
                message: selectedJob.error?.trim()
                  ? formatUserFacingErrorRequired(selectedJob.error, t)
                  : t("jobs.status.failed"),
              })}
            </p>
            <div className="lab-errors-detail-actions">
              <button
                type="button"
                onClick={onGoToJob}
                className="lab-errors-action-primary"
              >
                {t("lab.goToJob")}
              </button>
              <button
                type="button"
                disabled={retryBusy}
                onClick={() => void onRetry()}
                className="lab-errors-action-secondary disabled:opacity-50"
              >
                {t("jobs.action.retry")}
              </button>
            </div>
            {retryError ? (
              <p className="font-mono text-[11px] text-red-400/95">{retryError}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">{t("lab.noErrors")}</p>
        )}
      </section>
    </div>
  );
}

export function JobCommandPaneBody() {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const { notifyHeaderError } = useSaveNotice();
  const job = lab?.selectedJob;
  const cmd = job?.command_line?.trim();
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const onCopy = async () => {
    if (!cmd) return;
    const ok = await copyText(cmd);
    if (ok) {
      setCopied(true);
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } else {
      notifyHeaderError(t("common.clipboardFailed"));
    }
  };

  if (!job) {
    return (
      <p className="font-sans text-foreground-muted">{t("lab.selectJob")}</p>
    );
  }

  if (!cmd) {
    return (
      <p className="font-sans text-foreground-muted">{t("lab.noCommandLine")}</p>
    );
  }

  return (
    <div className="lab-command-pane">
      <h3 className="lab-console-heading">{t("lab.commandTitle")}</h3>
      <pre className="lab-command-pre">{cmd}</pre>
      <div className="lab-command-footer">
        <p className="max-w-md font-sans text-[11px] leading-relaxed text-foreground-muted">
          {t("lab.commandFooter")}
        </p>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="lab-command-copy-btn"
        >
          {copied ? t("lab.copiedCommand") : t("lab.copyCommand")}
        </button>
      </div>
    </div>
  );
}

export function DockPaneContent({ tab }: { tab: LabDockTab }) {
  switch (tab) {
    case "inspector":
      return (
        <div className="lab-dock-pane-scroll font-mono text-xs">
          <JobInspectorPaneBody />
        </div>
      );
    case "errors":
      return (
        <div className="lab-dock-pane-scroll">
          <JobErrorsPaneBody />
        </div>
      );
    case "command":
      return (
        <div className="lab-dock-pane-scroll flex min-h-0 flex-1 flex-col">
          <JobCommandPaneBody />
        </div>
      );
    default:
      return <JobLogPaneBody />;
  }
}
