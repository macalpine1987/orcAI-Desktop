import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  useLabJobOptional,
  type LabDockTab,
} from "../../lab/LabJobContext";
import type { JobRecord } from "../../api/jobs";
import { parseStoredInspectorWidth, LAB_DOCK_INSPECTOR_WIDTH_KEY } from "../../lib/labDockLayout";

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

export { TABS, readInspectorWidth, DockStatusDot, DockToggleChevron, DockResizeGripIcon, DockTabBar };
