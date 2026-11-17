import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import type { SpectrogramMeta } from "../../api/spectrogram";
import type { LabelTimeUnit } from "../../api/labels";
import {
  type DetectionRow,
  type DetectionSelection,
} from "../../lib/spectrogramDetections";
import {
  confidenceFractionToFloorPercent,
  floorPercentToConfidenceFraction,
} from "../../lib/spectrogramProbFloor";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";
import type { LabelColorMap } from "../../lib/labelColors";
import type { SpectrogramColormap } from "../../lib/spectrogramView";
import { AnnotationLanes, type LaneSegment } from "../AnnotationLanes";
import { SpectrogramDetectionsTable } from "../SpectrogramDetectionsTable";
import { PredictResultsClassesFilterModal } from "../PredictResultsClassesFilterModal";
import type { ClassSidebarEntry } from "../PredictResultsClassSidebar";
import type { OverlaySegment } from "../SpectrogramOverlay";
import { SpectrogramPlotAssembly } from "./SpectrogramPlotAssembly";
import { SpectrogramSimplePlot } from "./SpectrogramSimplePlot";
import {
  LANE_HEIGHT,
  type SpectrogramViewerProps,
} from "./spectrogramViewerTypes";
import type { SpectrogramHoverCoords } from "./useSpectrogramViewerHover";

type SegmentNav = {
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
};

type Options = {
  studioChrome: boolean;
  isScientific: boolean;
  lightGrayCanvas: boolean;
  segmentPortaled: boolean;
  showSpectrogram: boolean;
  showDetectionsPanel: boolean;
  showLanes: boolean;
  wavPath: string;
  meta: SpectrogramMeta;
  channel: number;
  duration: number;
  axisMaxHz: number;
  specHeight: number;
  plotCanvasRef: RefObject<HTMLDivElement | null>;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  handPanArmed: boolean;
  canScrollTime: boolean;
  onSeekPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  updateHoverFromClient: (clientX: number, clientY: number) => void;
  setHoverCoords: Dispatch<SetStateAction<SpectrogramHoverCoords | null>>;
  seekToTime: (sec: number) => void;
  viewStart: number;
  viewSpan: number;
  viewEnd: number;
  visibleSpan: number;
  tileMediaStyle: CSSProperties;
  grayTileSrc: string;
  colormap: SpectrogramColormap;
  tileReloadToken: string;
  plotWidth: number;
  onTileLoading: () => void;
  onTileLoaded: () => void;
  onTileFailed: () => void;
  showTileLoadingOverlay: boolean;
  overlayOnSpec: boolean;
  hasLabels: boolean;
  overlaySegments: OverlaySegment[];
  allSegments: OverlaySegment[];
  labelNames: string[];
  labelDeltaT: number | null | undefined;
  labelTimeUnit: LabelTimeUnit | undefined;
  labelColorMap: LabelColorMap;
  hiddenLabels: Set<string>;
  soloLabel: string | null;
  selectedSegment: DetectionSelection | null;
  markOpacity: number;
  showProbabilityLabels: boolean;
  onSegmentClick: (seg: OverlaySegment) => void;
  loopRegion: TimeRangeSec | null;
  timeSelectionDraft: TimeRangeSec | null;
  timeSelection: TimeRangeSec | null;
  playheadFrac: number | null;
  setViewStartClamped: (start: number) => void;
  detectionRows: DetectionRow[];
  segmentNav: SegmentNav;
  confidenceMin: number;
  setConfidenceMin: Dispatch<SetStateAction<number>>;
  labelSource: SpectrogramViewerProps["labelSource"];
  focusDetection: (t0: number, t1: number, label?: string) => void;
  labelsError: string | null;
  labelPath: string | null | undefined;
  compareLabelPath: string | null | undefined;
  classesFilterOpen: boolean;
  setClassesFilterOpen: Dispatch<SetStateAction<boolean>>;
  classSidebarEntries: ClassSidebarEntry[];
  modelClasses: readonly string[] | null | undefined;
  classSidebarTotal: number;
  classSidebarUnfilteredTotal: number;
  predictThreshold: number | null | undefined;
  toggleClassVisibility: (label: string) => void;
};

/** Builds plot / table / lanes / classes-filter JSX nodes for chrome bags. */
export function useSpectrogramViewerNodes(opts: Options) {
  const { t } = useTranslation();
  const {
    studioChrome,
    isScientific,
    lightGrayCanvas,
    segmentPortaled,
    showSpectrogram,
    showDetectionsPanel,
    showLanes,
    wavPath,
    meta,
    channel,
    duration,
    axisMaxHz,
    specHeight,
    plotCanvasRef,
    seekAreaRef,
    handPanArmed,
    canScrollTime,
    onSeekPointerDown,
    onSeekPointerMove,
    onSeekPointerUp,
    onSeekClick,
    updateHoverFromClient,
    setHoverCoords,
    seekToTime,
    viewStart,
    viewSpan,
    viewEnd,
    visibleSpan,
    tileMediaStyle,
    grayTileSrc,
    colormap,
    tileReloadToken,
    plotWidth,
    onTileLoading,
    onTileLoaded,
    onTileFailed,
    showTileLoadingOverlay,
    overlayOnSpec,
    hasLabels,
    overlaySegments,
    allSegments,
    labelNames,
    labelDeltaT,
    labelTimeUnit,
    labelColorMap,
    hiddenLabels,
    soloLabel,
    selectedSegment,
    markOpacity,
    showProbabilityLabels,
    onSegmentClick,
    loopRegion,
    timeSelectionDraft,
    timeSelection,
    playheadFrac,
    setViewStartClamped,
    detectionRows,
    segmentNav,
    confidenceMin,
    setConfidenceMin,
    labelSource,
    focusDetection,
    labelsError,
    labelPath,
    compareLabelPath,
    classesFilterOpen,
    setClassesFilterOpen,
    classSidebarEntries,
    modelClasses,
    classSidebarTotal,
    classSidebarUnfilteredTotal,
    predictThreshold,
    toggleClassVisibility,
  } = opts;

  const plotAssembly = (
    <SpectrogramPlotAssembly
      studioChrome={studioChrome}
      isScientific={isScientific}
      lightGrayCanvas={lightGrayCanvas}
      segmentPortaled={segmentPortaled}
      wavPath={wavPath}
      meta={meta}
      channel={channel}
      duration={duration}
      axisMaxHz={axisMaxHz}
      specHeight={specHeight}
      plotCanvasRef={plotCanvasRef}
      seekAreaRef={seekAreaRef}
      handPanArmed={handPanArmed}
      canScrollTime={canScrollTime}
      onSeekPointerDown={onSeekPointerDown}
      onSeekPointerMove={onSeekPointerMove}
      onSeekPointerUp={onSeekPointerUp}
      onSeekClick={onSeekClick}
      updateHoverFromClient={updateHoverFromClient}
      setHoverCoords={setHoverCoords}
      seekToTime={seekToTime}
      viewStart={viewStart}
      viewSpan={viewSpan}
      viewEnd={viewEnd}
      visibleSpan={visibleSpan}
      tileMediaStyle={tileMediaStyle}
      grayTileSrc={grayTileSrc}
      colormap={colormap}
      tileReloadToken={tileReloadToken}
      plotWidth={plotWidth}
      onTileLoading={onTileLoading}
      onTileLoaded={onTileLoaded}
      onTileFailed={onTileFailed}
      showTileLoadingOverlay={showTileLoadingOverlay}
      overlayOnSpec={overlayOnSpec}
      hasLabels={hasLabels}
      overlaySegments={overlaySegments}
      labelNames={labelNames}
      labelDeltaT={labelDeltaT ?? 0}
      labelTimeUnit={labelTimeUnit}
      labelColorMap={labelColorMap}
      hiddenLabels={hiddenLabels}
      soloLabel={soloLabel}
      selectedSegment={selectedSegment}
      markOpacity={markOpacity}
      showProbabilityLabels={showProbabilityLabels}
      onSegmentClick={onSegmentClick}
      loopRegion={loopRegion}
      timeSelectionDraft={timeSelectionDraft}
      timeSelection={timeSelection}
      playheadFrac={playheadFrac}
    />
  );

  const simplePlot = (
    <SpectrogramSimplePlot
      studioChrome={studioChrome}
      isScientific={isScientific}
      seekAreaRef={seekAreaRef}
      handPanArmed={handPanArmed}
      canScrollTime={canScrollTime}
      specHeight={specHeight}
      onSeekPointerDown={onSeekPointerDown}
      onSeekPointerMove={onSeekPointerMove}
      onSeekPointerUp={onSeekPointerUp}
      onSeekClick={onSeekClick}
      updateHoverFromClient={updateHoverFromClient}
      setHoverCoords={setHoverCoords}
      seekToTime={seekToTime}
      viewStart={viewStart}
      viewSpan={viewSpan}
      visibleSpan={visibleSpan}
      duration={duration}
      tileMediaStyle={tileMediaStyle}
      grayTileSrc={grayTileSrc}
      colormap={colormap}
      tileReloadToken={tileReloadToken}
      wavPath={wavPath}
      plotWidth={plotWidth}
      onTileLoading={onTileLoading}
      onTileLoaded={onTileLoaded}
      onTileFailed={onTileFailed}
      showTileLoadingOverlay={showTileLoadingOverlay}
      overlayOnSpec={overlayOnSpec}
      hasLabels={hasLabels}
      overlaySegments={overlaySegments}
      labelNames={labelNames}
      labelDeltaT={labelDeltaT ?? 0}
      labelTimeUnit={labelTimeUnit}
      labelColorMap={labelColorMap}
      hiddenLabels={hiddenLabels}
      soloLabel={soloLabel}
      selectedSegment={selectedSegment}
      markOpacity={markOpacity}
      showProbabilityLabels={showProbabilityLabels}
      axisMaxHz={axisMaxHz}
      onSegmentClick={onSegmentClick}
      loopRegion={loopRegion}
      timeSelectionDraft={timeSelectionDraft}
      timeSelection={timeSelection}
      playheadFrac={playheadFrac}
      setViewStartClamped={setViewStartClamped}
    />
  );

  const detectionsTable = showDetectionsPanel ? (
    <SpectrogramDetectionsTable
      rows={detectionRows}
      segmentStart={segmentNav.viewStart}
      segmentEnd={segmentNav.viewStart + segmentNav.viewSpan}
      fileKey={wavPath}
      selected={selectedSegment}
      filteredByConfidence={confidenceMin > 0}
      colorMap={labelColorMap}
      studioLayout={studioChrome}
      labelSource={labelSource}
      onRowActivate={(row) => focusDetection(row.t0, row.t1, row.label)}
    />
  ) : null;

  const lanesPanel =
    !studioChrome && showLanes ? (
      <div className="analysis-lanes-panel border-t border-border bg-surface px-1 py-0.5">
        {labelsError && (
          <p className="px-2 py-1 font-mono text-[10px] text-foreground">
            {labelsError}
          </p>
        )}
        {allSegments.length > 0 ? (
          <AnnotationLanes
            segments={overlaySegments as LaneSegment[]}
            viewStart={viewStart}
            viewSpan={viewSpan}
            width={plotWidth}
            height={LANE_HEIGHT}
            durationSec={duration}
            deltaT={labelDeltaT}
            timeUnit={labelTimeUnit}
            colorMap={labelColorMap}
            hiddenLabels={hiddenLabels}
            soloLabel={soloLabel}
            nyquistHz={axisMaxHz}
          />
        ) : (
          <p className="px-2 py-2 font-mono text-[10px] text-foreground-muted">
            {labelPath || compareLabelPath
              ? t("spectrogram.noSegments")
              : t("spectrogram.lanesHint")}
          </p>
        )}
      </div>
    ) : null;

  const classesFilterModal =
    studioChrome && !showSpectrogram ? (
      <PredictResultsClassesFilterModal
        open={classesFilterOpen}
        onClose={() => setClassesFilterOpen(false)}
        entries={classSidebarEntries}
        modelClasses={modelClasses}
        hidden={hiddenLabels}
        colorMap={labelColorMap}
        totalCount={classSidebarTotal}
        unfilteredCount={classSidebarUnfilteredTotal}
        probabilityFloor={confidenceFractionToFloorPercent(confidenceMin)}
        predictThreshold={predictThreshold}
        onProbabilityFloorChange={(pct) =>
          setConfidenceMin(floorPercentToConfidenceFraction(pct))
        }
        onToggle={toggleClassVisibility}
      />
    ) : null;

  return {
    plotAssembly,
    simplePlot,
    detectionsTable,
    lanesPanel,
    classesFilterModal,
  };
}
