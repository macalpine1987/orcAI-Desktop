/** Feeds project data-health tips into the header notice chip (opt-in «Отображать советы»). */

import { useEffect, useMemo, useState } from "react";
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
import { useSaveNotice } from "../ui/saveNotice";

export function ProjectDataHealthBanner() {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const { dataHealthBannerEnabled } = usePreferences();
  const workspace = useWorkspace();
  const { setHeaderTip } = useSaveNotice();
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

  useEffect(() => {
    if (!dataHealthBannerEnabled || !pick || !projectId) {
      setHeaderTip("data-health", null);
      return;
    }
    setHeaderTip("data-health", {
      message: t(pick.messageKey, { count: pick.count }),
      actionLabel: t("shellHealth.goToProject"),
      actionTo: "/projects",
      onDismiss: () => {
        dismissDataHealth(projectId, pick.code);
        setDismissTick((n) => n + 1);
      },
    });
    return () => {
      setHeaderTip("data-health", null);
    };
  }, [dataHealthBannerEnabled, pick, projectId, setHeaderTip, t]);

  return null;
}
