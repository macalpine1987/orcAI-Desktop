/** Advisory amber strip: WAV / annotation / table gaps for the active project. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePreferences } from "../preferences/PreferencesContext";
import {
  dismissDataHealth,
  dismissedDataHealthCodes,
  pickDataHealthMessage,
} from "../lib/projectDataHealth";

export function ProjectDataHealthBanner() {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const { dataHealthBannerEnabled } = usePreferences();
  const workspace = useWorkspace();
  const projectId = workspace.activeProjectId;
  const { summary } = useProjectSummary(
    dataHealthBannerEnabled && online ? projectId : null,
  );
  const [dismissTick, setDismissTick] = useState(0);

  const focus =
    workspace.activeProjectFocus ??
    summary?.focus ??
    (workspace.activeProjectKind === "training" ? "training" : "recognition");

  const pick = useMemo(() => {
    void dismissTick;
    if (
      !dataHealthBannerEnabled ||
      !projectId ||
      !online ||
      !summary?.data_health
    ) {
      return null;
    }
    // Skip session-dismissed codes so the next priority still surfaces.
    return pickDataHealthMessage(
      summary.data_health,
      focus,
      dismissedDataHealthCodes(projectId),
    );
  }, [
    dataHealthBannerEnabled,
    dismissTick,
    focus,
    online,
    projectId,
    summary?.data_health,
  ]);

  if (!dataHealthBannerEnabled || !pick || !projectId) return null;

  return (
    <div
      className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded border border-amber-500/40 bg-subtle px-4 py-3 text-sm text-foreground-muted"
      role="status"
    >
      <p className="min-w-0 flex-1">
        {t(pick.messageKey, { count: pick.count })}
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to="/projects" className="jobs-action-link text-xs">
          {t("shellHealth.goToProject")}
        </Link>
        <button
          type="button"
          className="jobs-action-link text-xs"
          onClick={() => {
            dismissDataHealth(projectId, pick.code);
            setDismissTick((n) => n + 1);
          }}
        >
          {t("shellHealth.dismiss")}
        </button>
      </div>
    </div>
  );
}
