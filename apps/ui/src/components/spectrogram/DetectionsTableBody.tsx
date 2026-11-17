import type { CSSProperties, RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDetectionDurationValue,
  formatSpectrogramTimestamp,
} from "../../lib/formatSpectrogramTime";
import {
  colorForLabel,
  formatDetectionClassCode,
  formatDetectionTypeLabel,
  formatDetectionTypeLabelWithCode,
  type LabelColorMap,
} from "../../lib/labelColors";
import type { DetectionRow, DetectionSelection } from "../../lib/spectrogramDetections";
import type { AnalysisLabelKind } from "../../lib/predictQueueUi";
import {
  columnHeaderKey,
  type DetectionColumnId,
} from "./detectionTableColumns";

type Props = {
  studioLayout: boolean;
  labelSource: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  typesOpen: boolean;
  columnsOpen: boolean;
  setTypesOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  setColumnsOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  listScope: "segment" | "file";
  setListScope: (scope: "segment" | "file") => void;
  visibleRows: DetectionRow[];
  rowsLength: number;
  filteredByConfidence: boolean;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  selectedRowRef: RefObject<HTMLTableRowElement | null>;
  selected: DetectionSelection | null;
  selectedRow: DetectionRow | null;
  show: (id: DetectionColumnId) => boolean;
  colorMap?: LabelColorMap;
  publicationNames: Record<string, string>;
  onRowActivate: (row: DetectionRow) => void;
};

export function DetectionsTableBody({
  studioLayout,
  labelSource,
  typesOpen,
  columnsOpen,
  setTypesOpen,
  setColumnsOpen,
  listScope,
  setListScope,
  visibleRows,
  rowsLength,
  filteredByConfidence,
  tableScrollRef,
  selectedRowRef,
  selected,
  selectedRow,
  show,
  colorMap,
  publicationNames,
  onRowActivate,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <header className="analysis-detections-header">
        <div className="analysis-detections-header-row">
          <div className="min-w-0">
            <h3
              id="spectrogram-detections-title"
              className="analysis-detections-title"
            >
              {t("spectrogram.detections.title")}
            </h3>
            {studioLayout && labelSource ? (
              <div className="analysis-detections-label-source">
                <div
                  className="analysis-detections-label-source-switch"
                  role="group"
                  aria-label={t("predict.results.labelSourceAria")}
                >
                  <button
                    type="button"
                    className="analysis-detections-label-source-btn"
                    aria-pressed={labelSource.kind === "original"}
                    disabled={!labelSource.originalAvailable}
                    title={t("predict.results.labelSourceOriginalHint")}
                    onClick={() => labelSource.onChange("original")}
                  >
                    {t("predict.results.labelSourceOriginal")}
                  </button>
                  <button
                    type="button"
                    className="analysis-detections-label-source-btn"
                    aria-pressed={labelSource.kind === "filtered"}
                    disabled={!labelSource.filteredAvailable}
                    title={t("predict.results.labelSourceFilteredHint")}
                    onClick={() => labelSource.onChange("filtered")}
                  >
                    {t("predict.results.labelSourceFiltered")}
                  </button>
                </div>
                {labelSource.fileName ? (
                  <span
                    className="analysis-detections-label-file"
                    title={labelSource.fileName}
                  >
                    {labelSource.fileName}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="analysis-detections-header-actions">
            {!studioLayout ? (
              <button
                type="button"
                className={`analysis-detections-columns-btn${
                  typesOpen ? " is-active" : ""
                }`}
                data-detection-legend=""
                aria-pressed={typesOpen}
                aria-label={t("spectrogram.detections.typesButton")}
                title={t("spectrogram.detections.typesButton")}
                onClick={() => {
                  setTypesOpen((v) => !v);
                  setColumnsOpen(false);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="7.5" cy="8" r="2.25" />
                  <circle cx="7.5" cy="16" r="2.25" />
                  <path d="M12 8h8M12 16h8" />
                </svg>
              </button>
            ) : null}
            {!studioLayout ? (
            <button
              type="button"
              className={`analysis-detections-columns-btn${
                columnsOpen ? " is-active" : ""
              }`}
              data-detection-columns=""
              aria-pressed={columnsOpen}
              aria-label={t("spectrogram.detections.columnsButton")}
              title={t("spectrogram.detections.columnsButton")}
              onClick={() => {
                setColumnsOpen((v) => !v);
                setTypesOpen(false);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3.5" y="4.5" width="5" height="15" rx="1" />
                <rect x="9.5" y="4.5" width="5" height="15" rx="1" />
                <rect x="15.5" y="4.5" width="5" height="15" rx="1" />
              </svg>
            </button>
            ) : null}
            {!studioLayout ? (
            <div
              className="analysis-detections-scope"
              role="group"
              data-detection-scope=""
              aria-label={t("spectrogram.detections.scopeLabel")}
            >
              <button
                type="button"
                className={`analysis-detections-scope-btn${
                  listScope === "segment" ? " is-active" : ""
                }`}
                aria-pressed={listScope === "segment"}
                onClick={() => setListScope("segment")}
              >
                {t("spectrogram.detections.scopeSegment")}
              </button>
              <button
                type="button"
                className={`analysis-detections-scope-btn${
                  listScope === "file" ? " is-active" : ""
                }`}
                aria-pressed={listScope === "file"}
                onClick={() => setListScope("file")}
              >
                {t("spectrogram.detections.scopeFile")}
              </button>
            </div>
            ) : null}
          </div>
        </div>
      </header>

      {visibleRows.length === 0 ? (
        <p className="analysis-detections-empty">
          {rowsLength === 0
            ? filteredByConfidence
              ? t("spectrogram.detections.emptyFiltered")
              : t("spectrogram.detections.empty")
            : studioLayout
              ? t("spectrogram.detections.empty")
              : t("spectrogram.detections.emptySegment")}
        </p>
      ) : (
        <div
          ref={tableScrollRef}
          className="analysis-detections-table-scroll"
        >
          <table className="analysis-detections-table">
            <thead>
              <tr>
                {show("color") ? (
                  <th className="analysis-detections-th-color">
                    <span className="sr-only">
                      {t(columnHeaderKey("color"))}
                    </span>
                  </th>
                ) : null}
                {show("time") ? (
                  <th className="analysis-detections-th-time">
                    {t(columnHeaderKey("time"))}
                  </th>
                ) : null}
                {show("end") ? (
                  <th className="analysis-detections-th-end">
                    {t(columnHeaderKey("end"))}
                  </th>
                ) : null}
                {show("duration") ? (
                  <th className="analysis-detections-th-duration">
                    {t(columnHeaderKey("duration"))}
                  </th>
                ) : null}
                {show("class") ? (
                  <th className="analysis-detections-th-class">
                    {t(columnHeaderKey("class"))}
                  </th>
                ) : null}
                {show("type") ? (
                  <th className="analysis-detections-th-type">
                    {t(columnHeaderKey("type"))}
                  </th>
                ) : null}
                {show("confidence") ? (
                  <th className="analysis-detections-th-confidence">
                    {t(columnHeaderKey("confidence"))}
                  </th>
                ) : null}
                {show("file") ? (
                  <th className="analysis-detections-th-file">
                    {t(columnHeaderKey("file"))}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isSelected = selectedRow?.id === row.id;
                const labelColor = colorForLabel(row.label, colorMap);
                const typeLabel = formatDetectionTypeLabel(row.label, publicationNames);
                const classCode = formatDetectionClassCode(row.label);
                const typeTitle = formatDetectionTypeLabelWithCode(
                  row.label,
                  publicationNames,
                );
                const confidencePct =
                  row.confidence != null
                    ? Math.round(row.confidence * 100)
                    : null;
                const confidenceTooltip =
                  row.confidence != null
                    ? row.confidence.toFixed(2)
                    : null;
                const probTone =
                  confidencePct == null
                    ? null
                    : confidencePct >= 85
                      ? "high"
                      : confidencePct >= 55
                        ? "mid"
                        : "low";

                return (
                  <tr
                    key={row.id}
                    ref={isSelected ? selectedRowRef : undefined}
                    data-detection-id={row.id}
                    data-detection-select=""
                    className={`analysis-detections-row${
                      isSelected ? " is-selected" : ""
                    }${
                      selected != null && !isSelected ? " is-dimmed" : ""
                    }`}
                    style={
                      labelColor
                        ? ({
                            ["--detection-swatch" as string]: labelColor,
                          } as CSSProperties)
                        : undefined
                    }
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      onRowActivate(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowActivate(row);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                  >
                    {show("color") ? (
                      <td className="analysis-detections-td-color">
                        <span
                          className="analysis-detections-swatch"
                          title={typeTitle}
                          aria-hidden
                        />
                      </td>
                    ) : null}
                    {show("time") ? (
                      <td
                        className="analysis-detections-td-time"
                        title={t("spectrogram.detections.rowHint", {
                          time: formatSpectrogramTimestamp(row.t0),
                        })}
                      >
                        {formatSpectrogramTimestamp(row.t0)}
                      </td>
                    ) : null}
                    {show("end") ? (
                      <td className="analysis-detections-td-end">
                        {formatSpectrogramTimestamp(row.t1)}
                      </td>
                    ) : null}
                    {show("duration") ? (
                      <td className="analysis-detections-td-duration">
                        {t("spectrogram.detections.durationValue", {
                          value: formatDetectionDurationValue(row.durationSec),
                        })}
                      </td>
                    ) : null}
                    {show("class") ? (
                      <td
                        className="analysis-detections-td-class"
                        title={typeTitle}
                      >
                        <span
                          className="analysis-detections-swatch"
                          aria-hidden
                        />
                        <span className="analysis-detections-class-code">
                          {classCode}
                        </span>
                      </td>
                    ) : null}
                    {show("type") ? (
                      <td
                        className="analysis-detections-td-type"
                        title={typeTitle}
                      >
                        {typeLabel}
                      </td>
                    ) : null}
                    {show("confidence") ? (
                      <td
                        className="analysis-detections-td-confidence"
                        title={
                          confidenceTooltip
                            ? t("spectrogram.detections.probTooltip", {
                                value: confidenceTooltip,
                              })
                            : undefined
                        }
                      >
                        {confidencePct != null ? (
                          <span
                            className="analysis-detections-prob-wrap"
                            title={t("spectrogram.detections.probTooltip", {
                              value: confidenceTooltip!,
                            })}
                            aria-label={t(
                              "spectrogram.detections.probTooltip",
                              { value: confidenceTooltip! },
                            )}
                          >
                            <span className="analysis-detections-prob">
                              <span
                                className={`analysis-detections-prob-fill${
                                  probTone ? ` is-${probTone}` : ""
                                }`}
                                style={{ width: `${confidencePct}%` }}
                                aria-hidden
                              />
                            </span>
                            {!studioLayout ? (
                              <span className="analysis-detections-prob-label">
                                {`${confidencePct}%`}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                    {show("file") ? (
                      <td
                        className="analysis-detections-td-file"
                        title={row.fileName || undefined}
                      >
                        {row.fileName || "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
