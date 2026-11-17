import { Link } from "react-router-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { JobRecord } from "../../api/jobs";
import { useJobsListContext } from "../../hooks/useJobsList";
import { useNowSec } from "../../hooks/useNowSec";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import {
  formatDuration,
  formatJobTime,
  jobDurationSec,
  jobStatusI18nKey,
} from "../../lib/jobFormat";
import { jobTargetLabel } from "../../lib/jobTargetLabel";
import {
  JOB_STATUS_PILL_CLASS,
  JobStatusDot,
} from "../../lib/jobStatusDot";
import { useWorkspace } from "../../hooks/useWorkspace";
import { hasActiveProject } from "../../layout/navigation";
import { usePreferences } from "../../preferences/PreferencesContext";
import {
  HOME_RECENT_JOBS_LIMIT,
  HOME_RECENT_JOBS_MIN,
  homeRecentJobsVisibleCount,
} from "./homeRecentJobsVisible";

export {
  HOME_RECENT_JOBS_LIMIT,
  HOME_RECENT_JOBS_MAX,
  HOME_RECENT_JOBS_MIN,
  homeRecentJobsVisibleCount,
} from "./homeRecentJobsVisible";

function JobStatusPill({ status }: { status: JobRecord["status"] }) {
  const { t } = useTranslation();
  return (
    <span className={clsx("job-status-pill", JOB_STATUS_PILL_CLASS[status])}>
      <JobStatusDot status={status} />
      {t(jobStatusI18nKey(status))}
    </span>
  );
}

export function HomeRecentJobs() {
  const { t } = useTranslation();
  const { online, engineReady } = useSidecarStatus();
  const workspace = useWorkspace();
  const { defaultDockCollapsed } = usePreferences();
  const { jobs, loading } = useJobsListContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const [visibleLimit, setVisibleLimit] = useState(HOME_RECENT_JOBS_MIN);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const update = () => {
      setVisibleLimit(
        homeRecentJobsVisibleCount({
          panelHeightPx: panel.clientHeight,
          dockCollapsed: defaultDockCollapsed,
          jobCount: jobs.length,
        }),
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => update());
    ro.observe(panel);
    return () => ro.disconnect();
  }, [defaultDockCollapsed, jobs.length]);

  const recent = jobs.slice(0, Math.min(visibleLimit, HOME_RECENT_JOBS_LIMIT));
  const allJobsEnabled = engineReady && hasActiveProject(workspace);
  const hasLiveDuration = recent.some(
    (job) => job.status === "running" || job.status === "pending",
  );
  const nowSec = useNowSec(hasLiveDuration);
  /** After first settled empty list, keep empty copy — avoid poll «загрузка» flash. */
  const settledEmptyRef = useRef(false);
  if (recent.length > 0) {
    settledEmptyRef.current = false;
  } else if (!loading) {
    settledEmptyRef.current = true;
  }
  const showEmptyLoading =
    loading && recent.length === 0 && !settledEmptyRef.current;

  return (
    <section className="home-recent-jobs">
      {/* Title outside the table card — same pattern as home-quick-actions. */}
      <div className="home-recent-jobs-header mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          {t("home.recentJobsTitle")}
        </h2>
        {allJobsEnabled ? (
          <Link to="/jobs" className="jobs-action-link text-xs">
            {t("home.recentJobsAll")}
          </Link>
        ) : (
          <span
            className="jobs-action-link jobs-action-link--disabled text-xs"
            title={
              engineReady
                ? t("app.navRequiresProject")
                : t("projects.studio.actions.needsEngine")
            }
            aria-disabled="true"
          >
            {t("home.recentJobsAll")}
          </span>
        )}
      </div>

      {/* Keep the last table mounted during brief offline / engine start — only
          show placeholders when there is nothing to display yet. */}
      {recent.length === 0 ? (
        <div ref={panelRef} className="home-recent-jobs-panel">
          <p className="px-4 py-3 text-sm text-foreground-muted">
            {!online
              ? t("home.recentJobsOffline")
              : showEmptyLoading
                ? t("home.recentJobsLoading")
                : t("home.recentJobsEmpty")}
          </p>
        </div>
      ) : (
        <div
          ref={panelRef}
          className="jobs-table-body home-recent-jobs-panel overflow-x-auto"
        >
          <table className="jobs-table w-full min-w-[40rem] text-left">
            <thead>
              <tr>
                <th className="jobs-table-col-command">{t("jobs.colCommand")}</th>
                <th className="jobs-table-col-target">{t("jobs.colTarget")}</th>
                <th className="jobs-table-col-status">{t("jobs.colStatus")}</th>
                <th className="jobs-table-col-duration">{t("jobs.colDuration")}</th>
                <th className="jobs-table-col-finished">
                  {t("home.recentJobsColFinished")}
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((job) => {
                const duration = jobDurationSec(job, nowSec);
                const terminal =
                  job.status === "completed" ||
                  job.status === "failed" ||
                  job.status === "cancelled";
                const finishedAt = terminal ? job.updated_at : null;
                return (
                  <tr
                    key={job.id}
                    className="jobs-table-row jobs-table-row--static"
                  >
                    <td className="jobs-table-col-command">
                      {/* Always CLI id (orcai predict), never localized UI name. */}
                      <span className="jobs-command-label">{job.command}</span>
                    </td>
                    <td
                      className="jobs-table-col-target max-w-[12rem] truncate"
                      title={jobTargetLabel(job)}
                    >
                      {jobTargetLabel(job)}
                    </td>
                    <td className="jobs-table-col-status">
                      <JobStatusPill status={job.status} />
                    </td>
                    <td className="jobs-table-col-duration font-mono text-foreground-muted">
                      {duration != null ? formatDuration(duration) : "—"}
                    </td>
                    <td className="jobs-table-col-finished font-mono text-foreground-muted">
                      {finishedAt ? formatJobTime(finishedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
