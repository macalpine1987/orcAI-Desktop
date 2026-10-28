import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { retryJob } from "../api/jobs";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useJobsListContext } from "../hooks/useJobsList";
import { useJobLogTail } from "../hooks/useJobLogTail";
import {
  useLabJobOptional,
  type LabDockTab,
} from "../lab/LabJobContext";
import { jobCommandLabel } from "../lib/jobCommandLabel";
import {
  copyText,
  jobLogText,
} from "../lib/jobLogExport";
import {
  formatDuration,
  formatJobTime,
  isJobProgressIndeterminate,
  jobDurationSec,
  jobProgressPercent,
  jobStatusI18nKey,
} from "../lib/jobFormat";
import { jobTargetLabel } from "../lib/jobTargetLabel";
import { dockTabSubtitle } from "../lib/labDockSubtitle";
import { predictBatchStripPercent } from "../lib/predictBatchStripProgress";
import { usePredictBatchOptional } from "../predict/PredictBatchContext";
import {
  HighlightedJson,
  labLogLineIndentPx,
  labLogLineTone,
} from "../lib/labDockHighlight";
import {
  clampInspectorWidth,
  LAB_DOCK_INSPECTOR_WIDTH_KEY,
  maxInspectorWidthForContainer,
  LAB_DOCK_PANEL_HEIGHT_CLASS,
  MIN_INSPECTOR_WIDTH,
  parseStoredInspectorWidth,
  RESIZE_HANDLE_WIDTH,
} from "../lib/labDockLayout";
import { usePreferences } from "../preferences/PreferencesContext";
import type { JobRecord } from "../api/jobs";

const TABS: LabDockTab[] = ["log", "inspector", "errors", "command"];

function readInspectorWidth(): number {
  try {
    return parseStoredInspectorWidth(
      localStorage.getItem(LAB_DOCK_INSPECTOR_WIDTH_KEY),
    );
  } catch {
    return parseStoredInspectorWidth(null);
  }
}

function DockStatusDot({ status }: { status: JobRecord["status"] }) {
  return (
    <span
      className={clsx("lab-dock-status-dot", `lab-dock-status-dot--${status}`)}
      aria-hidden
    />
  );
}

function DockToggleChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={clsx(
        "shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        expanded ? "" : "rotate-180",
      )}
    >
      <path d="M5 7.5 9 11.5 13 7.5" />
    </svg>
  );
}

function DockResizeGripIcon() {
  return (
    <svg
      width="10"
      height="14"
      viewBox="0 0 12 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 opacity-70"
    >
      <path d="M3 5.5 6 2.5 9 5.5" />
      <path d="M3 10.5 6 13.5 9 10.5" />
    </svg>
  );
}

function DockTabBar({
  failedCount,
  tabSubtitle,
}: {
  failedCount: number;
  tabSubtitle: string | null;
}) {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const tab = lab?.dockTab ?? "log";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="lab-dock-tab-row flex shrink-0 items-center gap-1.5">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => lab?.setDockTab(id)}
            className={clsx(
              "lab-dock-tab",
              tab === id && "lab-dock-tab-active",
            )}
            aria-label={
              id === "errors" && failedCount > 0
                ? `${t(`lab.tab.${id}`)} (${failedCount})`
                : undefined
            }
          >
            {t(`lab.tab.${id}`)}
            {id === "errors" && failedCount > 0 && (
              <span className="lab-dock-tab-error-badge" aria-hidden />
            )}
          </button>
        ))}
      </div>
      {tabSubtitle && (
        <span className="lab-dock-tab-subtitle hidden sm:inline">
          {tabSubtitle}
        </span>
      )}
    </div>
  );
}

function JobLogPaneBody() {
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

function JobInspectorParamsBody() {
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

function JobInspectorPaneBody() {
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
          {job.error}
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

function JobErrorsPaneBody() {
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
        message: job.error,
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
      setRetryError(err instanceof Error ? err.message : String(err));
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
                message:
                  selectedJob.error?.trim() || t("jobs.status.failed"),
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

function JobCommandPaneBody() {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const job = lab?.selectedJob;
  const cmd = job?.command_line?.trim();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!cmd) return;
    const ok = await copyText(cmd);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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

function DockPaneContent({ tab }: { tab: LabDockTab }) {
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

function LabDockMain({
  dockExpanded,
  onCollapse,
}: {
  dockExpanded: boolean;
  onCollapse: () => void;
}) {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const { failedJobs } = useJobsListContext();
  const tab = lab?.dockTab ?? "log";
  const splitRef = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(readInspectorWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [inspectorMax, setInspectorMax] = useState(720);

  const showSplit = tab === "log";
  const tabSubtitle = dockTabSubtitle(tab, t, lab?.selectedJob ?? null);

  const clampWidth = useCallback((next: number) => {
    return clampInspectorWidth(next, splitRef.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const syncMax = () => {
      setInspectorMax(maxInspectorWidthForContainer(el.clientWidth));
      setInspectorWidth((w) => clampWidth(w));
    };
    syncMax();
    const ro = new ResizeObserver(syncMax);
    ro.observe(el);
    window.addEventListener("resize", syncMax);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncMax);
    };
  }, [clampWidth]);

  const finishDrag = useCallback(
    (pointerId?: number) => {
      if (!dragRef.current) return;
      if (pointerId != null && dragRef.current.pointerId !== pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      setInspectorWidth((w) => {
        const clamped = clampWidth(w);
        try {
          localStorage.setItem(
            LAB_DOCK_INSPECTOR_WIDTH_KEY,
            String(Math.round(clamped)),
          );
        } catch {
          /* ignore */
        }
        return clamped;
      });
    },
    [clampWidth],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      const delta = e.clientX - dragRef.current.startX;
      setInspectorWidth(clampWidth(dragRef.current.startWidth - delta));
    };
    const onPointerUp = (e: PointerEvent) => finishDrag(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [clampWidth, finishDrag]);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: inspectorWidth,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      finishDrag(e.pointerId);
    }
  };

  const onCopyLog = () => {
    const job = lab?.selectedJob;
    if (!job) return;
    void copyText(jobLogText(job)).then((ok) => {
      if (ok) {
        setLogCopied(true);
        window.setTimeout(() => setLogCopied(false), 1500);
      }
    });
  };

  return (
    <div
      ref={splitRef}
      className={clsx("studio-panel lab-dock-frame flex min-h-0 flex-col", LAB_DOCK_PANEL_HEIGHT_CLASS)}
    >
      <div className="lab-dock-header">
        <DockTabBar
          failedCount={failedJobs.length}
          tabSubtitle={tabSubtitle}
        />
        <div className="lab-dock-toolbar-actions">
          <button
            type="button"
            disabled={!lab?.selectedJob}
            onClick={onCopyLog}
            className="lab-dock-toolbar-btn"
          >
            {logCopied ? t("lab.copiedCommand") : t("lab.copyLog")}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="lab-dock-toolbar-btn lab-dock-toolbar-btn--collapse"
          >
            {t("lab.collapseShort")}
            <DockToggleChevron expanded />
          </button>
          <span className="lab-dock-grip-icon" aria-hidden>
            <DockResizeGripIcon />
          </span>
        </div>
      </div>
      <div className="lab-dock-body">
        {showSplit ? (
          <>
            <section className="lab-dock-pane lab-dock-pane-log lab-dock-inner-pane">
              <DockPaneContent tab="log" />
            </section>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={inspectorWidth}
              aria-valuemin={MIN_INSPECTOR_WIDTH}
              aria-valuemax={inspectorMax}
              aria-label={t("lab.resizeDockPanels")}
              tabIndex={dockExpanded ? 0 : -1}
              onPointerDown={onResizePointerDown}
              onPointerUp={onResizePointerUp}
              className={clsx(
                "lab-dock-split-handle",
                isDragging && "lab-dock-split-handle-active",
              )}
              style={{ width: RESIZE_HANDLE_WIDTH }}
            />
            <section
              className="lab-dock-pane lab-dock-pane-inspector lab-dock-inner-pane"
              style={{ width: inspectorWidth }}
            >
              <div className="lab-dock-inspector-heading">
                {t("lab.taskParams")}
              </div>
              <div className="lab-dock-pane-scroll">
                <JobInspectorParamsBody />
              </div>
            </section>
          </>
        ) : (
          <section className="lab-dock-pane lab-dock-pane-full">
            <DockPaneContent tab={tab} />
          </section>
        )}
      </div>
    </div>
  );
}

export function LabDock() {
  const { t } = useTranslation();
  const { defaultDockCollapsed, setDefaultDockMode } = usePreferences();
  const collapsed = defaultDockCollapsed;
  const expanded = !collapsed;
  const lab = useLabJobOptional();
  const { activeJob } = useJobsListContext();
  const predictBatch = usePredictBatchOptional();

  const toggleCollapsed = useCallback(() => {
    setDefaultDockMode(collapsed ? "expanded" : "collapsed", { silent: true });
  }, [collapsed, setDefaultDockMode]);

  const statusJob = activeJob ?? lab?.selectedJob;
  const pct = statusJob ? jobProgressPercent(statusJob) : null;
  const hasLiveDuration = statusJob?.status === "running";
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!hasLiveDuration) return;
    const id = window.setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, [hasLiveDuration]);

  const predictBatchActive =
    predictBatch?.batchRunning === true &&
    predictBatch.batchProgress != null &&
    predictBatch.batchProgress.total > 0;

  const predictBatchProgress = predictBatchActive
    ? predictBatch!.batchProgress!
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

  let statusText = expanded ? t("lab.dockStatusOpen") : t("lab.dockStatusClosed");
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
    ? (statusJob!.params.paths as unknown[])
    : [];
  const importTotal =
    statusJob?.command === "import-audio" && importPaths.length > 0
      ? importPaths.length
      : 0;
  const importDone =
    importTotal > 0 && pct != null
      ? Math.min(importTotal, Math.round((pct / 100) * importTotal))
      : null;

  const showStripProgress = predictBatchActive
    ? predictStripPct != null
    : statusJob != null &&
      statusJob.status === "running" &&
      (pct != null || isJobProgressIndeterminate(statusJob));

  const stripProgressWidth = predictBatchActive
    ? `${predictStripPct ?? 0}%`
    : pct != null
      ? `${pct}%`
      : "30%";

  return (
    <div className="mat-dock lab-dock-root relative z-10 flex shrink-0 flex-col">
      <div
        className={clsx(
          "grid transition-[grid-template-rows] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          "duration-300",
        )}
        aria-hidden={!expanded}
      >
        <div
          className={clsx(
            "min-h-0 overflow-hidden",
            !expanded && "pointer-events-none",
          )}
        >
          <div className="lab-dock-expanded-wrap">
            <LabDockMain dockExpanded={expanded} onCollapse={toggleCollapsed} />
          </div>
        </div>
      </div>
      {!expanded ? (
        <div
          className="studio-panel lab-dock-status-strip lab-dock-status-strip--collapsed"
          role="region"
          aria-label={t("lab.dockConsole")}
        >
          <span className="lab-dock-status-label">{t("lab.dockConsole")}</span>
          {predictBatchActive || statusJob ? (
            <DockStatusDot
              status={predictBatchActive ? "running" : statusJob!.status}
            />
          ) : null}
          <span className="lab-dock-status-text">{statusText}</span>
          {showStripProgress ? (
            <>
              <div className="lab-dock-status-progress-track" aria-hidden>
                <div
                  className={clsx(
                    "lab-dock-status-progress-fill",
                    (predictBatchActive || importTotal > 0) &&
                      "lab-dock-status-progress-fill--batch",
                    pct == null &&
                      !predictBatchActive &&
                      "lab-dock-status-progress-fill--indeterminate",
                  )}
                  style={{ width: stripProgressWidth }}
                />
              </div>
              {predictBatchProgress ? (
                <span className="lab-dock-status-files">
                  {t("lab.dockPredictFiles", {
                    done: Math.min(
                      predictBatchProgress.total,
                      Math.floor(predictBatchProgress.done),
                    ),
                    total: predictBatchProgress.total,
                  })}
                </span>
              ) : importDone != null && importTotal > 0 ? (
                <span className="lab-dock-status-files">
                  {t("lab.dockPredictFiles", {
                    done: importDone,
                    total: importTotal,
                  })}
                </span>
              ) : pct != null ? (
                <span className="lab-dock-status-pct">{pct}%</span>
              ) : null}
            </>
          ) : null}
          {!predictBatchActive && statusJob?.status === "running" ? (
            <span className="lab-dock-status-duration">
              {formatDuration(jobDurationSec(statusJob, nowSec))}
            </span>
          ) : null}
          <span className="lab-dock-status-spacer" aria-hidden />
          <button
            type="button"
            onClick={toggleCollapsed}
            className="lab-dock-strip-btn"
            aria-expanded={expanded}
            aria-label={t("lab.expandDock")}
            title={t("lab.expandDock")}
          >
            {t("lab.expandShort")}
            <DockToggleChevron expanded={expanded} />
          </button>
          <span className="lab-dock-strip-grip" aria-hidden>
            <DockResizeGripIcon />
          </span>
        </div>
      ) : null}
    </div>
  );
}
