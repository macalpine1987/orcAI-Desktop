import { useEffect } from "react";
import type { TFunction } from "i18next";
import type { PredictTabId } from "../components/PredictTabs";
import {
  resolvePredictActiveTab,
  savePredictActiveTab,
} from "../lib/predictPageSession";

type Options = {
  t: TFunction;
  activeTab: PredictTabId;
  setActiveTabState: React.Dispatch<React.SetStateAction<PredictTabId>>;
  queueReady: boolean;
  resultsEnabled: boolean;
  filterTabEnabled: boolean;
  queueLoading: boolean;
  orcaiReady: boolean;
  batchRunning: boolean;
  resultsTabBadgeCount: number | null;
  analysisTabHint: boolean;
};

export function usePredictTabsNav({
  t,
  setActiveTabState,
  queueReady,
  resultsEnabled,
  filterTabEnabled,
  queueLoading,
  orcaiReady,
  batchRunning,
  resultsTabBadgeCount,
  analysisTabHint,
}: Options) {
  useEffect(() => {
    setActiveTabState((tab) => {
      const next = resolvePredictActiveTab(tab, {
        queueReady,
        resultsEnabled,
        filterEnabled: filterTabEnabled,
        queueLoading,
      });
      if (next !== tab) savePredictActiveTab(next);
      return next;
    });
  }, [queueReady, resultsEnabled, filterTabEnabled, queueLoading, setActiveTabState]);

  const tabs: {
    id: PredictTabId;
    label: string;
    badge?: string;
    badgeTitle?: string;
    disabled?: boolean;
    disabledTitle?: string;
    hint?: boolean;
  }[] = [
    {
      id: "run",
      label: t("predict.tabs.run"),
    },
    {
      id: "results",
      label: t("predict.tabs.results"),
      badge:
        resultsEnabled && resultsTabBadgeCount != null
          ? String(resultsTabBadgeCount)
          : undefined,
      badgeTitle:
        resultsEnabled && resultsTabBadgeCount != null
          ? t("predict.tabs.resultsBadgeDetections", {
              count: resultsTabBadgeCount,
            })
          : undefined,
      disabled: !resultsEnabled,
      disabledTitle: !orcaiReady
        ? t("predict.tabs.resultsNeedEngine")
        : batchRunning
          ? t("predict.tabs.resultsBusy")
          : t("predict.tabs.resultsDisabled"),
      hint: analysisTabHint && resultsEnabled,
    },
    {
      id: "filter",
      label: t("predict.tabs.filter"),
      disabled: !filterTabEnabled,
      disabledTitle: !orcaiReady
        ? t("predict.tabs.filterDisabled")
        : t("predict.tabs.filterNeedsLabels"),
    },
  ];

  return { tabs };
}
