import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  PROJECT_FOCUSES,
  type ProjectFocus,
  type ProjectRecord,
  type ProjectRecordingTable,
  type ProjectSummary,
} from "../../api/projects";
import {
  classesCountLabel,
  focusLabel,
  formatTotalHours,
  totalDurationSec,
} from "../../lib/projectsStudio";

type Props = {
  project: ProjectRecord;
  summary: ProjectSummary | null;
  table: ProjectRecordingTable | null;
  focus: ProjectFocus;
  isActive: boolean;
  busy: boolean;
  engineReady: boolean;
  onChangeFocus: (focus: ProjectFocus) => void;
  onDelete: () => void;
  onInit: () => void;
};

/**
 * m02 / m33 project chrome inside the work stage:
 * name · АКТИВНЫЙ · path (under name) · [цель radios] · delete (right edge).
 * Display name is fixed after create (same as orcAI — no rename).
 * Opening / picking a project always makes it app-active — no manual «Сделать активным».
 */
export function ProjectHeaderCard({
  project,
  summary,
  table,
  focus,
  isActive,
  busy,
  engineReady,
  onChangeFocus,
  onDelete,
  onInit,
}: Props) {
  const { t } = useTranslation();
  const wavCount = table?.rows.filter((r) => r.wav_exists).length ?? project.wav_count;
  const hours = table ? formatTotalHours(totalDurationSec(table.rows), t) : null;
  const annotations = summary?.readiness_lines.annotations ?? null;
  const calls = table?.calls ?? [];
  const classes = classesCountLabel(calls, (annotations?.annotated ?? 0) > 0, t);
  const inferred = (summary?.focus_source ?? project.focus_source) === "inferred";

  return (
    <header className="ps-header-card" aria-label={project.display_name}>
      <div className="ps-header-top">
        <div className="ps-header-leading">
          <div className="ps-header-title-row">
            <h2 className="ps-header-name">{project.display_name}</h2>
            {isActive ? (
              <span className="ps-badge ps-badge-active">{t("projects.studio.header.active")}</span>
            ) : null}
            {!project.initialized ? (
              <span className="ps-badge">{t("projects.studio.header.notInitialized")}</span>
            ) : null}
          </div>
          <span className="ps-header-path" title={project.path}>
            {project.path}
          </span>
        </div>

        <div className="ps-header-focus">
          <div
            className="ps-focus-radios"
            role="radiogroup"
            aria-label={t("projects.studio.focus.change")}
            title={t("projects.studio.focus.hint")}
          >
            {PROJECT_FOCUSES.map((f) => {
              const selected = focus === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={clsx("ps-focus-radio", selected && "is-selected")}
                  disabled={busy}
                  onClick={() => {
                    if (!selected) onChangeFocus(f);
                  }}
                >
                  <span className="ps-radio" aria-hidden />
                  <span className="ps-focus-radio-label">{focusLabel(f, t)}</span>
                </button>
              );
            })}
          </div>
          {inferred ? (
            <span className="ps-metric-sub">{t("projects.studio.header.cliProject")}</span>
          ) : null}
        </div>

        <div className="ps-header-trailing">
          <div className="ps-header-tools">
            {!project.initialized ? (
              <button
                type="button"
                className="ps-btn ps-btn-sm"
                onClick={onInit}
                disabled={busy || !engineReady}
                title={!engineReady ? t("projects.studio.actions.needsEngine") : undefined}
              >
                {t("projects.studio.actions.init")}
              </button>
            ) : null}
            <button
              type="button"
              className="ps-btn ps-btn-sm ps-btn-danger"
              onClick={onDelete}
              disabled={busy}
            >
              {t("projects.studio.actions.deleteProject")}
            </button>
          </div>
        </div>
      </div>

      <div className="ps-header-metrics">
        <div className="min-w-0">
          <span className="ps-metric-label">{t("projects.studio.header.recordings")}</span>
          <span className="ps-metric-value">
            {t("projects.studio.header.wavCount", { count: wavCount })}
            {hours ? ` · ${hours}` : ""}
          </span>
          {(table != null ? !table.table_exists : project.recording_table_path == null) ? (
            <span className="ps-metric-sub ps-text-warn">
              {t("projects.studio.table.tableMissing")}
            </span>
          ) : null}
        </div>
        {focus !== "recognition" ? (
          <div className="min-w-0">
            <span className="ps-metric-label">{t("projects.studio.header.annotations")}</span>
            <span className="ps-metric-value">
              {annotations
                ? annotations.total > 0
                  ? t("projects.studio.header.annotatedOf", {
                      annotated: annotations.annotated,
                      total: annotations.total,
                    })
                  : String(annotations.annotated)
                : "—"}
            </span>
          </div>
        ) : null}
        <div className="min-w-0">
          <span className="ps-metric-label">{t("projects.studio.header.classes")}</span>
          <span className="ps-metric-value">{classes}</span>
        </div>
      </div>
    </header>
  );
}
