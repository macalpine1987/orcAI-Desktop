import { useTranslation } from "react-i18next";
import type { ResultsSummaryResponse } from "../../api/results";
import {
  formatKpiDuration,
  formatResultsMeanP,
  formatResultsThresholds,
  type ResultsVisibleSummary,
} from "../../lib/resultsStudio";

function KpiCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="results-kpi-cell">
      <div className="results-kpi-label">{label}</div>
      <div className="results-kpi-value-row">
        <div className="results-kpi-value">{value}</div>
        {unit ? <span className="results-kpi-unit">{unit}</span> : null}
      </div>
    </div>
  );
}

type Props = {
  view: ResultsVisibleSummary;
  thresholds: ResultsSummaryResponse["summary"]["thresholds"];
};

export function ResultsStudioKpi({ view, thresholds }: Props) {
  const { t } = useTranslation();
  return (
    <section className="results-kpi" aria-label={t("results.kpiAria")}>
      <KpiCell label={t("results.kpiDetections")} value={String(view.detection_count)} />
      <KpiCell label={t("results.kpiFiles")} value={String(view.recording_count)} />
      <KpiCell
        label={t("results.kpiDuration")}
        value={formatKpiDuration(view.duration_sec)}
        unit={t("results.kpiDurationUnit")}
      />
      <KpiCell label={t("results.kpiMeanP")} value={formatResultsMeanP(view.mean_p)} />
      <KpiCell
        label={t("results.kpiThreshold")}
        value={formatResultsThresholds(thresholds)}
      />
    </section>
  );
}
