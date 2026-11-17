import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ResultsSource, ResultsSummaryRow } from "../../api/results";
import {
  colorForLabel,
  formatDetectionClassCode,
  formatDetectionTypeLabel,
} from "../../lib/labelColors";
import {
  formatDetectionDurationValue,
  formatSpectrogramTimestamp,
} from "../../lib/formatSpectrogramTime";
import {
  formatResultsMeanP,
  probabilityBarTone,
  toggleResultsSort,
  type ResultsSort,
  type ResultsTableFilters,
} from "../../lib/resultsStudio";

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
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

type Props = {
  source: ResultsSource;
  filters: ResultsTableFilters;
  patchFilters: (next: Partial<ResultsTableFilters>) => void;
  sort: ResultsSort;
  setSort: Dispatch<SetStateAction<ResultsSort>>;
  minProbDraft: string;
  setMinProbDraft: Dispatch<SetStateAction<string>>;
  recordingOptions: string[];
  classOptions: string[];
  visible: ResultsSummaryRow[];
  totalRows: number;
  activeRowId: string | null;
  publicationNames: Record<string, string>;
  openRow: (row: ResultsSummaryRow) => void;
};

export function ResultsStudioTable({
  source,
  filters,
  patchFilters,
  sort,
  setSort,
  minProbDraft,
  setMinProbDraft,
  recordingOptions,
  classOptions,
  visible,
  totalRows,
  activeRowId,
  publicationNames,
  openRow,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="results-table-block">
      <div className="results-table-filters">
        <span className="results-filter-label">{t("results.filterLabel")}</span>
        <select
          aria-label={t("results.filterRecording")}
          value={filters.recording}
          onChange={(e) => {
            const recording = e.target.value;
            // Exact file filter makes substring search redundant — clear and lock it.
            patchFilters(
              recording
                ? { recording, fileQuery: "" }
                : { recording },
            );
          }}
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
          disabled={Boolean(filters.recording)}
          title={
            filters.recording
              ? t("results.filterSearchDisabledHint")
              : undefined
          }
          onChange={(e) => patchFilters({ fileQuery: e.target.value })}
        />
        <p className="results-table-count">
          {t("results.visibleCount", {
            visible: visible.length,
            total: totalRows,
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
                  {totalRows === 0 ? t("results.empty") : t("results.filteredEmpty")}
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
  );
}
