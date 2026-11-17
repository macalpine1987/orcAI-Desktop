import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ResultsSource,
  ResultsSummaryResponse,
  ResultsSummaryRow,
} from "../api/results";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import {
  formatDetectionTypeLabel,
  sortLabelsForLegend,
} from "../lib/labelColors";
import {
  EMPTY_RESULTS_FILTERS,
  filterResultsRows,
  sortResultsRows,
  summarizeResultsRows,
  DEFAULT_RESULTS_SORT,
  classChartColumns,
  recordingsInRowOrder,
  resultsFilterResetKey,
  resultsFiltersAreBaseline,
  seedResultsMinProb,
  type ResultsSort,
  type ResultsTableFilters,
} from "../lib/resultsStudio";
import { IconExport } from "./SpectrogramIcons";
import { ResultsAudacityExportDialog } from "./ResultsAudacityExportDialog";
import { ResultsStudioClassChart } from "./results/ResultsStudioClassChart";
import { ResultsStudioKpi } from "./results/ResultsStudioKpi";
import { ResultsStudioTable } from "./results/ResultsStudioTable";

type Props = {
  data: ResultsSummaryResponse;
  source: ResultsSource;
  onSourceChange: (source: ResultsSource) => void;
  busy?: boolean;
  exportBusy?: boolean;
  onExportCsv: (rows: ResultsSummaryRow[]) => void;
  onExportAudacity: (rows: ResultsSummaryRow[]) => void;
  onOpenDetection: (row: ResultsSummaryRow) => void;
};

const SOURCES: ResultsSource[] = ["predicted", "filtered", "annotations"];

export function ResultsStudio({
  data,
  source,
  onSourceChange,
  busy = false,
  exportBusy = false,
  onExportCsv,
  onExportAudacity,
  onOpenDetection,
}: Props) {
  const { t } = useTranslation();
  const publicationNames = useClassPublicationNames();
  const [filters, setFilters] = useState<ResultsTableFilters>(() => ({
    ...EMPTY_RESULTS_FILTERS,
    minProb: seedResultsMinProb(data.source, data.summary.thresholds),
  }));
  const [sort, setSort] = useState<ResultsSort>(DEFAULT_RESULTS_SORT);
  const [minProbDraft, setMinProbDraft] = useState(() => {
    const th = seedResultsMinProb(data.source, data.summary.thresholds);
    return th == null ? "" : th.toFixed(2);
  });
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [audacityOpen, setAudacityOpen] = useState(false);

  const filterResetKey = resultsFilterResetKey(
    data.source,
    data.scan_dir,
    data.summary.thresholds,
  );
  useEffect(() => {
    const th = seedResultsMinProb(data.source, data.summary.thresholds);
    setMinProbDraft(th == null ? "" : th.toFixed(2));
    setFilters({
      ...EMPTY_RESULTS_FILTERS,
      minProb: th,
    });
    // filterResetKey is value-stable across refetch (new thresholds[] identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [filterResetKey]);

  const typeLabelFor = useMemo(
    () => (label: string) => formatDetectionTypeLabel(label, publicationNames),
    [publicationNames],
  );
  const filteredRows = useMemo(
    () => filterResultsRows(data.rows, filters, { typeLabelFor }),
    [data.rows, filters, typeLabelFor],
  );
  const visible = useMemo(
    () => sortResultsRows(filteredRows, sort, typeLabelFor),
    [filteredRows, sort, typeLabelFor],
  );
  const view = useMemo(() => summarizeResultsRows(filteredRows), [filteredRows]);
  const baseline = resultsFiltersAreBaseline(
    filters,
    data.source,
    data.summary.thresholds,
  );
  // Baseline filters → sidecar summary aggregates (truncated rows must not undercount).
  const kpiView = baseline
    ? {
        detection_count: data.summary.detection_count,
        recording_count: data.summary.recording_count,
        duration_sec: data.summary.duration_sec,
        mean_p: data.summary.mean_p,
        classes: data.classes,
      }
    : view;
  const chartRows = useMemo(
    () =>
      filterResultsRows(data.rows, { ...filters, classLabel: "" }, { typeLabelFor }),
    [data.rows, filters, typeLabelFor],
  );
  const chart = useMemo(() => summarizeResultsRows(chartRows), [chartRows]);
  const chartClasses = baseline ? data.classes : chart.classes;

  const classCols = useMemo(
    () => classChartColumns(chartClasses, filters.classLabel),
    [chartClasses, filters.classLabel],
  );
  const classMax = Math.max(1, ...classCols.map((item) => item.count));

  const recordingOptions = useMemo(
    () =>
      [...data.recordings].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [data.recordings],
  );

  const classOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of data.rows) {
      if (seen.has(row.label)) continue;
      seen.add(row.label);
      out.push(row.label);
    }
    return sortLabelsForLegend(out);
  }, [data.rows]);

  const patchFilters = (next: Partial<ResultsTableFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  };

  const openRow = (row: ResultsSummaryRow) => {
    setActiveRowId(row.id);
    onOpenDetection(row);
  };

  const audacityRecordings = useMemo(
    () => recordingsInRowOrder(visible),
    [visible],
  );

  const confirmAudacityExport = (selectedNames: string[]) => {
    const allow = new Set(selectedNames);
    setAudacityOpen(false);
    onExportAudacity(visible.filter((row) => allow.has(row.recording)));
  };

  return (
    <div className="results-studio">
      <div className="results-studio-toolbar">
        <div
          className="results-source-toggle predict-tabs-m03"
          role="group"
          aria-label={t("results.sourceAria")}
        >
          {SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              className="predict-tab"
              aria-selected={source === id}
              disabled={busy}
              onClick={() => onSourceChange(id)}
            >
              {t(`results.source.${id}`)}
            </button>
          ))}
        </div>
        <div className="results-studio-toolbar-actions">
          <button
            type="button"
            className="predict-results-page-btn predict-results-page-btn--filled"
            disabled={exportBusy || visible.length === 0}
            onClick={() => onExportCsv(visible)}
          >
            <span className="predict-results-page-btn__icon" aria-hidden>
              <IconExport />
            </span>
            {t("results.exportCsv")}
          </button>
          <button
            type="button"
            className="predict-results-page-btn predict-results-page-btn--filled"
            disabled={exportBusy || visible.length === 0}
            onClick={() => setAudacityOpen(true)}
          >
            <span className="predict-results-page-btn__icon" aria-hidden>
              <IconExport />
            </span>
            {t("results.exportAudacity")}
          </button>
        </div>
      </div>

      <ResultsAudacityExportDialog
        open={audacityOpen}
        recordings={audacityRecordings}
        busy={exportBusy}
        onCancel={() => setAudacityOpen(false)}
        onConfirm={confirmAudacityExport}
      />

      {data.truncated ? (
        <p className="results-page-notice" role="status">
          {t("results.truncated", {
            shown: data.rows.length,
            total: data.summary.detection_count,
          })}
        </p>
      ) : null}
      {(data.files_failed ?? 0) > 0 ? (
        <p className="results-page-notice" role="status">
          {t("results.filesFailed", { count: data.files_failed })}
        </p>
      ) : null}

      <ResultsStudioKpi view={kpiView} thresholds={data.summary.thresholds} />
      <ResultsStudioClassChart
        classCols={classCols}
        classMax={classMax}
        selectedLabel={filters.classLabel}
      />
      <ResultsStudioTable
        source={source}
        filters={filters}
        patchFilters={patchFilters}
        sort={sort}
        setSort={setSort}
        minProbDraft={minProbDraft}
        setMinProbDraft={setMinProbDraft}
        recordingOptions={recordingOptions}
        classOptions={classOptions}
        visible={visible}
        totalRows={data.rows.length}
        activeRowId={activeRowId}
        publicationNames={publicationNames}
        openRow={openRow}
      />
    </div>
  );
}
