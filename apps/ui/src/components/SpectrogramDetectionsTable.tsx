import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import {
  sortLabelsForLegend,
  type LabelColorMap,
} from "../lib/labelColors";
import {
  detectionRowsInRange,
  detectionTypeCounts,
  findDetectionRowForSelection,
  revealElementInScrollers,
  type DetectionRow,
  type DetectionSelection,
} from "../lib/spectrogramDetections";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";
import {
  ALL_COLUMNS,
  DEFAULT_VISIBLE,
  STUDIO_VISIBLE,
  type DetectionColumnId,
} from "./spectrogram/detectionTableColumns";
import type { ListScope } from "./spectrogram/detectionTableTypes";
import { useModalFocus } from "./spectrogram/useModalFocus";
import { DetectionsTableModals } from "./spectrogram/DetectionsTableModals";
import { DetectionsTableFooter } from "./spectrogram/DetectionsTableFooter";
import { DetectionsTableBody } from "./spectrogram/DetectionsTableBody";

export type { DetectionColumnId };

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
      const head =
        scroller instanceof HTMLElement ? scroller.querySelector("thead") : null;
      const headH = head instanceof HTMLElement ? head.offsetHeight : 0;
      return revealElementInScrollers(
        el,
        scroller instanceof HTMLElement ? scroller : null,
        headH,
      );
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
      <DetectionsTableBody
        studioLayout={studioLayout}
        labelSource={labelSource}
        typesOpen={typesOpen}
        columnsOpen={columnsOpen}
        setTypesOpen={setTypesOpen}
        setColumnsOpen={setColumnsOpen}
        listScope={listScope}
        setListScope={setListScope}
        visibleRows={visibleRows}
        rowsLength={rows.length}
        filteredByConfidence={filteredByConfidence}
        tableScrollRef={tableScrollRef}
        selectedRowRef={selectedRowRef}
        selected={selected}
        selectedRow={selectedRow}
        show={show}
        colorMap={colorMap}
        publicationNames={publicationNames}
        onRowActivate={onRowActivate}
      />

      <DetectionsTableFooter
        studioLayout={studioLayout}
        effectiveScope={effectiveScope}
        visibleCount={visibleRows.length}
        fileTotal={rows.length}
      />

      <DetectionsTableModals
        typesOpen={typesOpen}
        columnsOpen={columnsOpen}
        setTypesOpen={setTypesOpen}
        setColumnsOpen={setColumnsOpen}
        typesDialogRef={typesDialogRef}
        columnsDialogRef={columnsDialogRef}
        effectiveScope={effectiveScope}
        typeSummary={typeSummary}
        rowsLength={rows.length}
        filteredByConfidence={filteredByConfidence}
        colorMap={colorMap}
        publicationNames={publicationNames}
        visibleCols={visibleCols}
        visibleCount={visibleCount}
        toggleColumn={toggleColumn}
      />
    </section>
  );
}
