import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type {
  ResultsClassBucket,
  ResultsSource,
  ResultsSummaryResponse,
  ResultsSummaryRow,
} from "../api/results";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import {
  colorForLabel,
  formatDetectionClassCode,
  formatDetectionTypeLabel,
  sortLabelsForLegend,
} from "../lib/labelColors";
import {
  formatDetectionDurationValue,
  formatSpectrogramTimestamp,
} from "../lib/formatSpectrogramTime";
import {
  EMPTY_RESULTS_FILTERS,
  filterResultsRows,
  formatKpiDuration,
  formatResultsMeanP,
  formatResultsThresholds,
  probabilityBarTone,
  sortResultsRows,
  summarizeResultsRows,
  toggleResultsSort,
  DEFAULT_RESULTS_SORT,
  classChartColumns,
  seedResultsMinProb,
  type ResultsSort,
  type ResultsTableFilters,
} from "../lib/resultsStudio";
import { IconExport } from "./SpectrogramIcons";

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

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

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

  useEffect(() => {
    const th = seedResultsMinProb(data.source, data.summary.thresholds);
    setMinProbDraft(th == null ? "" : th.toFixed(2));
    setFilters({
      ...EMPTY_RESULTS_FILTERS,
      minProb: th,
    });
  }, [data.source, data.scan_dir, data.summary.thresholds]);

  const filteredRows = useMemo(
    () => filterResultsRows(data.rows, filters),
    [data.rows, filters],
  );
  const visible = useMemo(
    () =>
      sortResultsRows(filteredRows, sort, (label) =>
        formatDetectionTypeLabel(label, publicationNames),
      ),
    [filteredRows, sort, publicationNames],
  );
  const view = useMemo(() => summarizeResultsRows(filteredRows), [filteredRows]);
  const chartRows = useMemo(
    () => filterResultsRows(data.rows, { ...filters, classLabel: "" }),
    [data.rows, filters],
  );
  const chart = useMemo(() => summarizeResultsRows(chartRows), [chartRows]);

  const classCols = useMemo(
    () => classChartColumns(chart.classes, filters.classLabel),
    [chart.classes, filters.classLabel],
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
            onClick={() => onExportAudacity(visible)}
          >
            <span className="predict-results-page-btn__icon" aria-hidden>
              <IconExport />
            </span>
            {t("results.exportAudacity")}
          </button>
        </div>
      </div>

      {data.truncated ? (
        <p className="results-page-notice" role="status">
          {t("results.truncated", { shown: data.rows.length })}
        </p>
      ) : null}
      {(data.files_failed ?? 0) > 0 ? (
        <p className="results-page-notice" role="status">
          {t("results.filesFailed", { count: data.files_failed })}
        </p>
      ) : null}

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
          value={formatResultsThresholds(data.summary.thresholds)}
        />
      </section>

      <section className="results-classes" aria-label={t("results.classesAria")}>
        <div className="results-classes-head">
          <h2 className="results-section-title">{t("results.classesTitle")}</h2>
          <span className="results-classes-hint">{t("results.classesHint")}</span>
        </div>
        {classCols.length === 0 ? (
          <p className="results-empty-hint">{t("results.classesEmpty")}</p>
        ) : (
          <ul
            className="results-class-chart"
            style={{ ["--rs-class-n"]: classCols.length } as CSSProperties}
          >
            {classCols.map((item) => (
              <ClassCol
                key={item.label}
                item={item}
                max={classMax}
                selected={Boolean(filters.classLabel) && item.label === filters.classLabel}
                muted={Boolean(filters.classLabel) && item.label !== filters.classLabel}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="results-table-block">
        <div className="results-table-filters">
          <span className="results-filter-label">{t("results.filterLabel")}</span>
          <select
            aria-label={t("results.filterRecording")}
            value={filters.recording}
            onChange={(e) => patchFilters({ recording: e.target.value })}
          >
            <option value="">{t("results.filterAllFiles")}</option>
            {recordingOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("results.filterClass")}
            value={filters.classLabel}
            onChange={(e) => patchFilters({ classLabel: e.target.value })}
          >
            <option value="">{t("results.filterAllClasses")}</option>
            {classOptions.map((label) => (
              <option key={label} value={label}>
                {formatDetectionClassCode(label)}
              </option>
            ))}
          </select>
          <label className="results-filter-prob">
            <span>{t("results.filterMinProb")}</span>
            <input
              inputMode="decimal"
              value={minProbDraft}
              placeholder="—"
              onChange={(e) => {
                setMinProbDraft(e.target.value);
                patchFilters({ minProb: parseOptionalNumber(e.target.value) });
              }}
            />
          </label>
          <input
            className="results-filter-search"
            value={filters.fileQuery}
            placeholder={t("results.filterSearch")}
            onChange={(e) => patchFilters({ fileQuery: e.target.value })}
          />
          <p className="results-table-count">
            {t("results.visibleCount", {
              visible: visible.length,
              total: data.rows.length,
            })}
          </p>
        </div>

        <div className="results-table-body">
          <table className="results-table">
            <thead>
              <tr>
                <SortTh
                  label={t("results.colRecording")}
                  active={sort.key === "recording"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "recording"))}
                />
                <SortTh
                  label={t("results.colStart")}
                  active={sort.key === "start_sec"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "start_sec"))}
                />
                <SortTh
                  label={t("results.colEnd")}
                  active={sort.key === "stop_sec"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "stop_sec"))}
                />
                <SortTh
                  label={t("results.colDuration")}
                  active={sort.key === "duration_sec"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "duration_sec"))}
                />
                <SortTh
                  label={t("results.colClass")}
                  active={sort.key === "label"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "label"))}
                />
                <SortTh
                  label={t("results.colType")}
                  active={sort.key === "type"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "type"))}
                />
                <SortTh
                  label={t("results.colProb")}
                  active={sort.key === "mean_p"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "mean_p"))}
                />
                <SortTh
                  label={t("results.colSource")}
                  active={sort.key === "kind"}
                  dir={sort.dir}
                  onClick={() => setSort((prev) => toggleResultsSort(prev, "kind"))}
                />
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="results-table-placeholder">
                    {data.rows.length === 0 ? t("results.empty") : t("results.filteredEmpty")}
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const color = colorForLabel(row.label);
                  const tone = probabilityBarTone(row.mean_p);
                  const width = row.mean_p == null ? 0 : Math.max(6, Math.min(100, row.mean_p * 100));
                  return (
                    <tr
                      key={row.id}
                      className={
                        activeRowId === row.id
                          ? "results-table-row is-selected"
                          : "results-table-row"
                      }
                      onClick={() => openRow(row)}
                    >
                      <td className="results-td-file">{row.recording}</td>
                      <td>{formatSpectrogramTimestamp(row.start_sec)}</td>
                      <td>{formatSpectrogramTimestamp(row.stop_sec)}</td>
                      <td>{formatDetectionDurationValue(row.duration_sec)}</td>
                      <td>
                        <span className="results-class-chip">
                          <i style={{ background: color }} />
                          {formatDetectionClassCode(row.label)}
                        </span>
                      </td>
                      <td className="results-td-type" style={{ color }}>
                        {formatDetectionTypeLabel(row.label, publicationNames)}
                      </td>
                      <td>
                        <div className="results-prob" title={formatResultsMeanP(row.mean_p)}>
                          <div className="results-prob-track">
                            <div
                              className={`results-prob-fill is-${tone}`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="results-td-kind">{row.kind ?? source}</td>
                      <td className="results-td-open">
                        <button
                          type="button"
                          className="results-action-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRow(row);
                          }}
                        >
                          {t("results.openRow")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

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

function ClassCol({
  item,
  max,
  selected = false,
  muted = false,
}: {
  item: ResultsClassBucket;
  max: number;
  selected?: boolean;
  muted?: boolean;
}) {
  const color = colorForLabel(item.label);
  const code = formatDetectionClassCode(item.label);
  const barH =
    item.count <= 0 ? 0 : Math.max(0.32, (item.count / Math.max(1, max)) * 3.35);
  return (
    <li
      className={`results-class-col${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`}
      title={`${code} · ${item.count}`}
      aria-current={selected ? "true" : undefined}
    >
      <span className="results-class-count">{item.count}</span>
      <div className="results-class-bar" style={{ height: `${barH}rem`, background: color }} />
      <span className="results-class-code">{code}</span>
    </li>
  );
}

function SortTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th>
      <button type="button" className={active ? "is-active" : undefined} onClick={onClick}>
        {label}
        {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
