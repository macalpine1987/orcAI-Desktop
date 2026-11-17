import { useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLabDockProgress } from "../hooks/useLabDockProgress";
import { usePreferences } from "../preferences/PreferencesContext";
import {
  DockStatusDot,
  DockToggleChevron,
  DockResizeGripIcon,
} from "./labDock/LabDockChrome";
import { LabDockMain } from "./labDock/LabDockMain";
import { LabDockProgressCluster } from "./labDock/LabDockProgressCluster";

export function LabDock() {
  const { t } = useTranslation();
  const { defaultDockCollapsed, setDefaultDockMode } = usePreferences();
  const collapsed = defaultDockCollapsed;
  const expanded = !collapsed;

  const toggleCollapsed = useCallback(() => {
    setDefaultDockMode(collapsed ? "expanded" : "collapsed", { silent: true });
  }, [collapsed, setDefaultDockMode]);

  const progress = useLabDockProgress({ expanded });

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
            <LabDockMain
              dockExpanded={expanded}
              onCollapse={toggleCollapsed}
              progress={progress}
            />
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
          {progress.ledStatus ? (
            <DockStatusDot status={progress.ledStatus} />
          ) : null}
          <span className="lab-dock-status-text">{progress.statusText}</span>
          <LabDockProgressCluster model={progress} />
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
