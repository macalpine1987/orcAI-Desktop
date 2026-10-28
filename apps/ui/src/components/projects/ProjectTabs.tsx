import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PROJECTS_TABS, type ProjectsTabId } from "../../lib/projectsStudio";

type Props = {
  active: ProjectsTabId;
  counts: Partial<Record<ProjectsTabId, number | null>>;
  onChange: (tab: ProjectsTabId) => void;
  /** Visible tabs; defaults to all four (m02). Field focus passes a subset. */
  tabs?: readonly ProjectsTabId[];
  /** Tab that hosts the primary next-step CTA — soft orange hint when not active. */
  guidedTab?: ProjectsTabId | null;
  /** Right-aligned actions on the same row as the tab pills (e.g. training wizard). */
  trailing?: ReactNode;
};

/** m02 tab pills with counters. Project data refresh is automatic (no manual «Проверить»). */
export function ProjectTabs({
  active,
  counts,
  onChange,
  tabs = PROJECTS_TABS,
  guidedTab = null,
  trailing = null,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="ps-tabs-row">
      <div className="ps-tabs predict-tabs-m03" role="tablist" aria-label={t("projects.studio.tabs.aria")}>
        {tabs.map((tab) => {
          const count = counts[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`projects-tab-${tab}`}
              aria-selected={active === tab}
              aria-controls={`projects-panel-${tab}`}
              className={clsx("predict-tab", guidedTab === tab && "is-guided")}
              onClick={() => onChange(tab)}
            >
              {t(`projects.studio.tabs.${tab}`)}
              {count !== undefined ? (
                <span className="predict-tab-badge">{count == null ? "…" : count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="ps-tabs-trailing">{trailing}</div> : null}
    </div>
  );
}
