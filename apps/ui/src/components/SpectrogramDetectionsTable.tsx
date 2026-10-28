import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  formatDetectionDurationValue,
  formatSpectrogramTimestamp,
} from "../lib/formatSpectrogramTime";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import {
  colorForLabel,
  formatDetectionClassCode,
  formatDetectionTypeLabel,
  formatDetectionTypeLabelWithCode,
  sortLabelsForLegend,
  type LabelColorMap,
} from "../lib/labelColors";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import {
  detectionRowsInRange,
  detectionTypeCounts,
  findDetectionRowForSelection,
  scrollElementIntoScroller,
  type DetectionRow,
  type DetectionSelection,
} from "../lib/spectrogramDetections";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";

type ListScope = "segment" | "file";

export type DetectionColumnId =
  | "color"
  | "time"
  | "end"
  | "duration"
  | "class"
  | "type"
  | "confidence"
  | "file";

const ALL_COLUMNS: DetectionColumnId[] = [
  "color",
  "time",
  "end",
  "duration",
  "class",
  "type",
  "confidence",
  "file",
];

const DEFAULT_VISIBLE: Record<DetectionColumnId, boolean> = {
  color: true,
  time: true,
  end: true,
  duration: true,
  class: true,
  type: true,
  confidence: true,
  file: true,
};

/** m04 studio: fixed columns, no types modal (sidebar owns КЛАССЫ). */
const STUDIO_VISIBLE: Record<DetectionColumnId, boolean> = {
  color: false,
  time: true,
  end: true,
  duration: true,
  class: true,
  type: true,
  confidence: true,
  file: true,
};

type Props = {
  rows: DetectionRow[];
  /** Current file-segment window [start, end) in absolute seconds. */
  segmentStart: number;
  segmentEnd: number;
  /** Reset list scope to «Segment» when the WAV changes. */
  fileKey?: string | null;
  selected: DetectionSelection | null;
  filteredByConfidence: boolean;
  colorMap?: LabelColorMap;
  /** m04 Predict Results studio table layout. */
  studioLayout?: boolean;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  onRowActivate: (row: DetectionRow) => void;
};

/** Long labels for the columns picker (mockup modal). */
function columnPickerKey(id: DetectionColumnId): string {
  switch (id) {
    case "color":
      return "spectrogram.detections.colColor";
    case "time":
      return "spectrogram.detections.colStart";
    case "end":
      return "spectrogram.detections.colEnd";
    case "duration":
      return "spectrogram.detections.colDuration";
    case "class":
      return "spectrogram.detections.colClass";
    case "type":
      return "spectrogram.detections.colType";
    case "confidence":
      return "spectrogram.detections.colConfidence";
    case "file":
      return "spectrogram.detections.colFile";
  }
}

/** Short labels for table `<th>` (mockup header row). */
function columnHeaderKey(id: DetectionColumnId): string {
  switch (id) {
    case "color":
      return "spectrogram.detections.colColor";
    case "time":
      return "spectrogram.detections.colStartHeader";
    case "end":
      return "spectrogram.detections.colEndHeader";
    case "duration":
      return "spectrogram.detections.colDurationHeader";
    case "class":
      return "spectrogram.detections.colClassHeader";
    case "type":
      return "spectrogram.detections.colTypeHeader";
    case "confidence":
      return "spectrogram.detections.colConfidenceHeader";
    case "file":
      return "spectrogram.detections.colFileHeader";
  }
}

function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  restoreRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreRef.current = previouslyFocused;
    const root = containerRef.current;
    const focusTarget =
      root?.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? root;
    focusTarget?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root) return;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root?.addEventListener("keydown", onKeyDown);
    return () => {
      root?.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open, containerRef, restoreRef]);
}

export function SpectrogramDetectionsTable({
  rows,
  segmentStart,
  segmentEnd,
  fileKey = null,
  selected,
  filteredByConfidence,
  colorMap,
  studioLayout = false,
  labelSource = null,
  onRowActivate,
}: Props) {
  const { t } = useTranslation();
  const publicationNames = useClassPublicationNames();
  const [listScope, setListScope] = useState<ListScope>("segment");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<DetectionColumnId, boolean>>(
    () => (studioLayout ? STUDIO_VISIBLE : DEFAULT_VISIBLE),
  );
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const typesDialogRef = useRef<HTMLDivElement | null>(null);
  const columnsDialogRef = useRef<HTMLDivElement | null>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);

  useModalFocus(typesOpen, typesDialogRef, focusRestoreRef);
  useModalFocus(columnsOpen, columnsDialogRef, focusRestoreRef);

  // Prefer «Segment» for a new WAV; keep «Whole file» while navigating segments.
  // m04 studio: whole-file list so scroll can cross segment boundaries.
  useEffect(() => {
    setListScope("segment");
  }, [fileKey, studioLayout]);

  const effectiveScope: ListScope = studioLayout ? "file" : listScope;

  useEffect(() => {
    if (!columnsOpen && !typesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setColumnsOpen(false);
        setTypesOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [columnsOpen, typesOpen]);

  const segmentRows = useMemo(
    () => detectionRowsInRange(rows, segmentStart, segmentEnd),
    [rows, segmentStart, segmentEnd],
  );

  // Spectrogram selection outside the current segment → show whole-file list
  // so the row can highlight (non-studio only; studio already lists the file).
  useEffect(() => {
    if (studioLayout || !selected || listScope === "file") return;
    const inSegment = findDetectionRowForSelection(segmentRows, selected);
    if (inSegment) return;
    if (findDetectionRowForSelection(rows, selected)) {
      setListScope("file");
    }
  }, [studioLayout, selected, listScope, segmentRows, rows]);

  const scopedRows = effectiveScope === "segment" ? segmentRows : rows;

  const selectedRow = useMemo(
    () => findDetectionRowForSelection(rows, selected),
    [rows, selected],
  );

  /** Keep the spectrogram-selected row visible even if it sits just outside the segment filter. */
  const visibleRows = useMemo(() => {
    if (!selectedRow) return scopedRows;
    if (scopedRows.some((row) => row.id === selectedRow.id)) return scopedRows;
    return [...scopedRows, selectedRow].sort(
      (a, b) => a.t0 - b.t0 || a.label.localeCompare(b.label),
    );
  }, [scopedRows, selectedRow]);

  const typeSummary = useMemo(
    () => detectionTypeCounts(visibleRows, sortLabelsForLegend),
    [visibleRows],
  );

  useLayoutEffect(() => {
    if (!selected || !selectedRow) return;
    let cancelled = false;
    const scrollSelectedIntoView = (): boolean => {
      const scroller = tableScrollRef.current;
      const el =
        selectedRowRef.current ??
        (selectedRow && scroller
          ? scroller.querySelector<HTMLElement>(
              `[data-detection-id="${CSS.escape(selectedRow.id)}"]`,
            )
          : null);
      if (!el) return false;
      if (!(scroller instanceof HTMLElement)) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        return true;
      }
      const head = scroller.querySelector("thead");
      const headH =
        head instanceof HTMLElement ? head.getBoundingClientRect().height : 0;
      scrollElementIntoScroller(el, scroller, headH);
      return true;
    };

    if (scrollSelectedIntoView()) return;

    const outer = requestAnimationFrame(() => {
      if (cancelled) return;
      if (scrollSelectedIntoView()) return;
      requestAnimationFrame(() => {
        if (!cancelled) scrollSelectedIntoView();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [selected, selectedRow, visibleRows]);

  // PRE-007: scrolling the detections list must not auto-seek playhead/segment.
  // Row ↔ spectrogram sync is click/keyboard via onRowActivate only.

  const show = (id: DetectionColumnId) => visibleCols[id];
  const visibleCount = ALL_COLUMNS.filter((id) => visibleCols[id]).length;

  const toggleColumn = (id: DetectionColumnId) => {
    setVisibleCols((prev) => {
      if (prev[id] && visibleCount <= 1) return prev;
      return { ...prev, [id]: !prev[id] };
    });
  };

  return (
    <section
      className="analysis-detections-panel"
      aria-labelledby="spectrogram-detections-title"
    >
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
          {rows.length === 0
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
                            {/* Studio: bar only; numeric value is hover tooltip. */}
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

      <footer className="analysis-detections-footer">
        {studioLayout ? (
          <span className="analysis-detections-footer-primary">
            {t("spectrogram.detections.footerFileShown", {
              count: visibleRows.length,
            })}
          </span>
        ) : (
          <>
            <span className="analysis-detections-footer-primary">
              {effectiveScope === "segment"
                ? t("spectrogram.detections.footerSegmentShown", {
                    count: visibleRows.length,
                  })
                : t("spectrogram.detections.footerFileShown", {
                    count: visibleRows.length,
                  })}
            </span>
            {effectiveScope === "segment" ? (
              <span className="analysis-detections-footer-secondary">
                {t("spectrogram.detections.footerFileTotal", {
                  count: rows.length,
                })}
              </span>
            ) : null}
          </>
        )}
      </footer>

      {typesOpen ? (
        <PredictAppModalPortal>
          <div
            className={PREDICT_APP_MODAL_OVERLAY_CLASS}
            role="presentation"
            onClick={() => setTypesOpen(false)}
          >
            <div
              ref={typesDialogRef}
              className="analysis-detections-types-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("spectrogram.detections.typesTitle")}
              data-detection-legend=""
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="analysis-detections-columns-header">
                <div className="min-w-0">
                  <h4 className="analysis-detections-columns-title">
                    {t("spectrogram.detections.typesTitle")}
                  </h4>
                  <p className="analysis-detections-columns-hint">
                    {effectiveScope === "segment"
                      ? t("spectrogram.detections.typesHintSegment")
                      : t("spectrogram.detections.typesHintFile")}
                  </p>
                </div>
                <ModalCloseButton
                  data-modal-initial-focus=""
                  aria-label={t("spectrogram.detections.columnsClose")}
                  title={t("spectrogram.detections.columnsClose")}
                  onClick={() => setTypesOpen(false)}
                />
              </div>
              {typeSummary.length === 0 ? (
                <p className="analysis-detections-types-empty">
                  {rows.length === 0
                    ? filteredByConfidence
                      ? t("spectrogram.detections.emptyFiltered")
                      : t("spectrogram.detections.empty")
                    : t("spectrogram.detections.emptySegment")}
                </p>
              ) : (
                <ul className="analysis-detections-types-list">
                  {typeSummary.map((item) => {
                    const swatch = colorForLabel(item.label, colorMap);
                    const typeLabel = formatDetectionTypeLabel(
                      item.label,
                      publicationNames,
                    );
                    const typeTitle = formatDetectionTypeLabelWithCode(
                      item.label,
                      publicationNames,
                    );
                    return (
                      <li
                        key={item.label}
                        className="analysis-detections-types-item"
                      >
                        <span
                          className="analysis-detections-types-swatch"
                          style={{ backgroundColor: swatch }}
                          title={typeTitle}
                          aria-hidden
                        />
                        <span
                          className="analysis-detections-types-label"
                          title={typeTitle}
                        >
                          {typeLabel}
                        </span>
                        <span className="analysis-detections-types-count">
                          {t("spectrogram.detections.typesCount", {
                            count: item.count,
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </PredictAppModalPortal>
      ) : null}

      {columnsOpen ? (
        <PredictAppModalPortal>
          <div
            className={PREDICT_APP_MODAL_OVERLAY_CLASS}
            role="presentation"
            onClick={() => setColumnsOpen(false)}
          >
            <div
              ref={columnsDialogRef}
              className="analysis-detections-columns-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("spectrogram.detections.columnsTitle")}
              data-detection-columns=""
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="analysis-detections-columns-header">
                <div className="min-w-0">
                  <h4 className="analysis-detections-columns-title">
                    {t("spectrogram.detections.columnsTitle")}
                  </h4>
                  <p className="analysis-detections-columns-hint">
                    {t("spectrogram.detections.columnsHint")}
                  </p>
                </div>
                <ModalCloseButton
                  data-modal-initial-focus=""
                  aria-label={t("spectrogram.detections.columnsClose")}
                  title={t("spectrogram.detections.columnsClose")}
                  onClick={() => setColumnsOpen(false)}
                />
              </div>
              <ul className="analysis-detections-columns-list">
                {ALL_COLUMNS.map((id) => {
                  const checked = visibleCols[id];
                  const disableUncheck = checked && visibleCount <= 1;
                  return (
                    <li key={id}>
                      <label className="analysis-detections-columns-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableUncheck}
                          onChange={() => toggleColumn(id)}
                        />
                        <span>{t(columnPickerKey(id))}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </PredictAppModalPortal>
      ) : null}
    </section>
  );
}
