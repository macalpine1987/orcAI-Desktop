import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FilterSettings } from "../workspace/predictSettings";
import { PredictFilterStudio, type PredictedFilterSource } from "./PredictFilterStudio";

type Props = {
  sources: PredictedFilterSource[];
  activePredictedPath: string;
  onSelectPredictedPath: (path: string) => void;
  limitsPath: string;
  labelSuffix: string;
  filterSettings: FilterSettings;
  filterSubmitting: boolean;
  orcaiReady: boolean;
  batchRunning: boolean;
  channel: number;
  onFilterSettingsChange: (next: FilterSettings) => void;
  onApply: (predictedPaths: string[], limitsPath: string) => void;
};

export function PredictFilterTabPanel({
  sources,
  activePredictedPath,
  onSelectPredictedPath,
  limitsPath,
  labelSuffix,
  filterSettings,
  filterSubmitting,
  orcaiReady,
  batchRunning,
  channel,
  onFilterSettingsChange,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const selected = useMemo(
    () =>
      sources.find((s) => s.predictedPath === activePredictedPath)?.predictedPath ??
      sources[0]?.predictedPath ??
      "",
    [sources, activePredictedPath],
  );

  return (
    <div className="predict-filter-studio">
      {sources.length > 0 ? (
        <PredictFilterStudio
          sources={sources}
          activePredictedPath={selected}
          onSelectPredictedPath={onSelectPredictedPath}
          limitsPath={limitsPath}
          labelSuffix={labelSuffix}
          filterSettings={filterSettings}
          onFilterSettingsChange={onFilterSettingsChange}
          orcaiReady={orcaiReady}
          batchRunning={batchRunning}
          filterSubmitting={filterSubmitting}
          onApply={onApply}
          channel={channel}
        />
      ) : (
        <p className="predict-filter-studio-empty">
          {!orcaiReady
            ? t("predict.engineRequiredForPredict")
            : t("predict.filterStudio.empty")}
        </p>
      )}
    </div>
  );
}
