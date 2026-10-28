import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { ProjectSummary } from "../../api/projects";
import { revealInFileManager } from "../../platform/shell";
import {
  formatNextActionsHint,
  readinessDotClass,
  readinessFocusLabel,
  readinessLineDetail,
  READINESS_ITEMS,
  type ReadinessItemKey,
} from "../../lib/projectSummaryFormat";

type Props = {
  projectName: string | null;
  projectPath: string | null;
  recordings: number | null;
  annotations: number | null;
  predicted: number | null;
  activeModelLabel: string | null;
  tableSyncStatus: "missing" | "stale" | "current" | null;
  loading?: boolean;
  /** When false, «Перейти» / «Открыть проект» is disabled (engine not running). */
  engineReady?: boolean;
  onChangeProject: () => void;
};

function IconOpenFolder({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M1.5 4.5h4l1.2 1.5H14.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z" />
      <path d="M1.5 7h13" />
    </svg>
  );
}

function MetricLcd({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  /** m01: set values use green LCD accent. */
  accent?: boolean;
}) {
  const empty = value === "—" || value === "…";
  return (
    <div
      className={clsx(
        "mat-lcd home-project-metric",
        accent && !empty && "is-accent",
      )}
    >
      <span className="home-project-metric-label">{label}</span>
      <span className="home-project-metric-value" title={empty ? undefined : value}>
        {value}
      </span>
    </div>
  );
}

/** m01 LCD: short ids (`isl-v1`), never absolute paths (trained model ids). */
export function shortHomeModelLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  let trimmed = name.trim();
  if (!trimmed) return null;
  // Sidecar trained models use absolute path as `id` / sometimes as settings.model.
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    const parts = trimmed.split(/[/\\]/).filter(Boolean);
    trimmed = parts[parts.length - 1] ?? trimmed;
  }
  const short = trimmed.replace(/^orcai-/i, "");
  return short || null;
}

export function HomeProjectCard({
  projectName,
  projectPath,
  recordings,
  annotations,
  predicted,
  activeModelLabel,
  tableSyncStatus,
  loading = false,
  engineReady = true,
  onChangeProject,
}: Props) {
  const { t } = useTranslation();
  const hasProject = Boolean(projectName && projectPath);
  const dash = "—";
  const fmt = (n: number | null) =>
    loading && n == null ? "…" : n == null ? dash : String(n);
  const changeDisabled = !engineReady;
  const changeTitle = changeDisabled
    ? t("projects.studio.actions.needsEngine")
    : undefined;

  const tableSyncKey =
    tableSyncStatus === "current"
      ? "home.projectTableCurrent"
      : tableSyncStatus === "stale"
        ? "home.projectTableStale"
        : tableSyncStatus === "missing"
          ? "home.projectTableMissing"
          : null;
  const tableSyncHintKey =
    tableSyncStatus === "current"
      ? "home.projectTableCurrentHint"
      : tableSyncStatus === "stale"
        ? "home.projectTableStaleHint"
        : tableSyncStatus === "missing"
          ? "home.projectTableMissingHint"
          : null;

  return (
    <section className="mat-card home-project-card flex flex-col p-4">
      <h2 className="home-card-eyebrow">{t("home.projectCardTitle")}</h2>

      {hasProject ? (
        <>
          <p
            className="home-project-name mt-2 truncate"
            title={projectName!}
          >
            {projectName}
          </p>
          <p
            className="home-project-path mt-0.5 truncate"
            title={projectPath!}
          >
            {projectPath}
          </p>
          <div className="home-project-metrics mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* m01: all four LCD values green when set. */}
            <MetricLcd label={t("home.projectMetricRecordings")} value={fmt(recordings)} accent />
            <MetricLcd
              label={t("home.projectMetricAnnotations")}
              value={fmt(annotations)}
              accent
            />
            <MetricLcd
              label={t("home.projectMetricPredicted")}
              value={fmt(predicted)}
              accent
            />
            <MetricLcd
              label={t("home.projectMetricModel")}
              value={
                loading && !activeModelLabel
                  ? "…"
                  : shortHomeModelLabel(activeModelLabel) ?? dash
              }
              accent
            />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-foreground-muted">{t("home.projectEmpty")}</p>
      )}

      <div className="home-project-footer mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap gap-2">
          {hasProject ? (
            <button
              type="button"
              className="mat-btn inline-flex items-center gap-1.5 text-sm"
              onClick={() => void revealInFileManager(projectPath!)}
            >
              <IconOpenFolder />
              {t("home.projectOpenFolder")}
            </button>
          ) : null}
          <button
            type="button"
            className="mat-btn text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={changeDisabled}
            title={changeTitle}
            onClick={onChangeProject}
          >
            {hasProject ? t("home.projectChange") : t("home.openProject")}
          </button>
        </div>
        {tableSyncKey && tableSyncHintKey ? (
          <p
            className={clsx(
              "home-project-table-status ml-auto inline-flex max-w-full items-center gap-1.5 text-[11px]",
              tableSyncStatus === "current" && "is-current",
              tableSyncStatus === "stale" && "is-stale",
              tableSyncStatus === "missing" && "is-missing",
            )}
            title={t(tableSyncHintKey)}
          >
            <span className="home-project-table-status-dot shrink-0" aria-hidden />
            <span className="truncate">{t(tableSyncKey)}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function HomeReadinessPanel({
  summary,
  projectName,
  loading = false,
}: {
  summary: ProjectSummary | null;
  projectName: string | null;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const nextHint = summary ? formatNextActionsHint(summary.next_actions, t) : null;

  return (
    <section className="mat-card home-readiness-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          {projectName
            ? t("home.readinessTitleNamed", { name: projectName })
            : t("home.readinessTitle")}
        </h2>
        {summary ? (
          <span className="home-readiness-focus-badge">
            {t("home.readinessFocusLabel", {
              focus: readinessFocusLabel(summary.focus, t),
            })}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-foreground-muted">{t("home.readinessHint")}</p>

      {!summary && !loading ? (
        <p className="mt-3 text-sm text-foreground-muted">{t("home.readinessNeedProject")}</p>
      ) : (
        <ul className="home-readiness-list mt-3 space-y-2.5">
          {READINESS_ITEMS.map((key) => {
            const state = summary?.readiness[key];
            const detail =
              summary && !loading
                ? readinessLineDetail(summary, key as ReadinessItemKey, t)
                : null;
            return (
              <li
                key={key}
                className={clsx(
                  "home-readiness-item flex items-center justify-between gap-3 text-xs",
                  loading && !state ? "opacity-60" : readinessDotClass(state),
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={clsx(
                      "readiness-row-dot shrink-0",
                      readinessDotClass(state),
                    )}
                    aria-hidden
                  />
                  <span>{t(`home.readiness.${key}`)}</span>
                </span>
                <span className="truncate text-right font-mono">
                  {loading && !detail ? "…" : (detail ?? "—")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {nextHint ? (
        <p className="mt-3 text-xs text-foreground-muted">{nextHint}</p>
      ) : null}
    </section>
  );
}
