import { useEffect, useRef, useState } from "react";
import { spectrogramAxisMaxHz } from "../../lib/spectrogramAxis";
import { loadStoredMarkOpacity } from "../../lib/spectrogramMarkOpacity";
import { useProjectClassColors } from "../../hooks/useProjectClassColors";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import { useLabSectionActive } from "../../layout/LabSectionActiveContext";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import { type TimeRangeSec } from "../../lib/spectrogramTimeRange";
import { spectrogramSegmentWindow } from "../../lib/spectrogramView";
import {
  invalidateSpectrogramTileCache,
  sidecarPortRequiresTileInvalidate,
} from "../../lib/spectrogramTileCache";
import { useSpectrogramAudacityExport } from "../../hooks/useSpectrogramAudacityExport";
import { useSpectrogramTileFetch } from "../../hooks/useSpectrogramTileFetch";
import { useSpectrogramPlotLayout } from "../../hooks/useSpectrogramPlotLayout";
import { useSpectrogramLabelsLoad } from "../../hooks/useSpectrogramLabelsLoad";
import { useSpectrogramTransportZoom } from "../../hooks/useSpectrogramTransportZoom";
import { buildSpectrogramChromeProps } from "./buildSpectrogramChromeProps";
import type { SpectrogramViewerChromeProps } from "./spectrogramViewerChromeProps";
import {
  SPEC_HEIGHT_DEFAULT,
  VIEW_WIDTH_UNSET,
  type SpectrogramViewerProps,
} from "./spectrogramViewerTypes";
import { useSpectrogramColormap } from "./useSpectrogramColormap";
import { useSpectrogramOverlayState } from "./useSpectrogramOverlayState";
import { useSpectrogramFocusSelection } from "./useSpectrogramFocusSelection";
import { useSpectrogramViewerDerived } from "./useSpectrogramViewerDerived";
import { useSpectrogramViewerHover } from "./useSpectrogramViewerHover";
import { useSpectrogramViewerNodes } from "./useSpectrogramViewerNodes";

/** Orchestrates spectrogram hooks + chrome bags; SpectrogramViewer stays a thin façade. */
export function useSpectrogramViewerModel({
  wavPath,
  meta,
  channel = 1,
  orcaiParameter = null,
  labelPath = null,
  compareLabelPath = null,
  layout = "proLab",
  studioChrome = false,
  showSpectrogram = true,
  transportSlot = null,
  toolsSlot = null,
  lcdSlot = null,
  zoomSlot = null,
  segmentSlot = null,
  classesToolsSlot = null,
  classesToolsOpen = false,
  onClassesToolsOpenChange,
  studioFilePicker = null,
  onDetectionTotalChange,
  onViewportReady,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  focusNav = null,
}: SpectrogramViewerProps): SpectrogramViewerChromeProps {
  const { sidecarPort } = useSidecarStatus();
  const { activeProjectId } = useWorkspace();
  const { colors: classColorOverrides } = useProjectClassColors();
  const duration = meta.duration_sec;
  const axisMaxHz = spectrogramAxisMaxHz(meta);
  const isScientific = layout === "scientific";
  const isProLab = layout === "proLab" || isScientific;
  const isProPlot = isProLab;
  const seekAreaRef = useRef<HTMLDivElement | null>(null);
  const plotCanvasRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(VIEW_WIDTH_UNSET);
  const [plotHeight, setPlotHeight] = useState(SPEC_HEIGHT_DEFAULT);
  const plotLayoutReady = plotWidth >= 64;
  const specHeight = studioChrome ? plotHeight : SPEC_HEIGHT_DEFAULT;

  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState(
    () => spectrogramSegmentWindow(0, duration).viewSpan,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const {
    primaryLabels,
    compareLabels,
    labelsError,
    tfBoundsNotice,
  } = useSpectrogramLabelsLoad({
    labelPath,
    compareLabelPath,
    wavPath,
    channel,
    orcaiParameter,
  });
  const [playheadSec, setPlayheadSec] = useState(0);
  const [selectedSegment, setSelectedSegment] =
    useState<DetectionSelection | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const { colormap, setColormap, lightGrayCanvas } = useSpectrogramColormap({
    layout: layout ?? "compact",
    isScientific,
    activeProjectId,
  });

  const [markOpacity, setMarkOpacity] = useState(loadStoredMarkOpacity);
  const [timeSelectionDraft, setTimeSelectionDraft] =
    useState<TimeRangeSec | null>(null);
  /** Fixed blue time selection from LMB drag (loopable via transport Loop). */
  const [timeSelection, setTimeSelection] = useState<TimeRangeSec | null>(null);
  const [loopRegion, setLoopRegion] = useState<TimeRangeSec | null>(null);
  /** Drag-to-pan across the whole file (hand tool). */
  const [handPanArmed, setHandPanArmed] = useState(false);
  const [handDragActive, setHandDragActive] = useState(false);

  const {
    overlayOnSpec,
    setOverlayOnSpec,
    showLanes,
    setShowLanes,
    hiddenLabels,
    setHiddenLabels,
    soloLabel,
    showProbabilityLabels,
    setShowProbabilityLabels,
    classesFilterOpen,
    setClassesFilterOpen,
    segmentHint,
    setSegmentHint,
    confidenceMin,
    setConfidenceMin,
    allSegments,
    overlaySegments,
    classSidebarEntries,
    classSidebarTotal,
    classSidebarUnfilteredTotal,
    labelNames,
    toggleClassVisibility,
    labelTimeUnit,
    labelDeltaT,
    hasLabels,
    hasLabelPaths,
    labelColorMap,
  } = useSpectrogramOverlayState({
    primaryLabels,
    compareLabels,
    labelPath,
    compareLabelPath,
    duration,
    classColorOverrides,
    wavPath,
    showSpectrogram: showSpectrogram !== false,
    onDetectionTotalChange,
  });

  const sectionActive = useLabSectionActive();
  const spectrogramLive = showSpectrogram !== false && sectionActive;

  const {
    tileError,
    setTileError,
    setTileFetchWindow,
    viewEnd,
    visibleSpan,
    grayTileSrc,
    tileReloadToken,
    tileMediaStyle,
    showTileLoadingOverlay,
    onTileLoading,
    onTileLoaded,
    onTileFailed,
    flushTileFetch,
  } = useSpectrogramTileFetch({
    wavPath,
    channel,
    orcaiParameter,
    duration,
    viewStart,
    viewSpan,
    plotWidth,
    plotLayoutReady,
    specHeight,
    reloadKey,
    showSpectrogram: spectrogramLive,
    onViewportReady,
    deferTileSwap: handDragActive,
    handPanArmed,
  });

  const sidecarPortSeenRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const previous = sidecarPortSeenRef.current;
    sidecarPortSeenRef.current = sidecarPort;
    if (!sidecarPortRequiresTileInvalidate(previous, sidecarPort)) return;
    invalidateSpectrogramTileCache();
    setReloadKey((k) => k + 1);
    setTileError(null);
  }, [sidecarPort, setTileError]);

  useSpectrogramPlotLayout({
    plotCanvasRef,
    wavPath,
    studioChrome,
    setPlotWidth,
    setPlotHeight,
  });

  const {
    applySegment,
    zoomIn,
    zoomOut,
    defaultViewSpan,
    studioZoomLevel,
    setStudioZoomLevel,
    pan,
    resetStudioSliders,
    toggleHandPan,
    setViewStartClamped,
    canScrollTime,
    seekToTime,
    coordsFromClient,
    clearLoop,
    handleLoopRegionToggle,
    onSeekPointerDown,
    onSeekPointerMove,
    onSeekPointerUp,
    onSeekClick,
    timeDragRef,
  } = useSpectrogramTransportZoom({
    duration,
    wavPath,
    projectScope: activeProjectId,
    viewStart,
    setViewStart,
    viewSpan,
    setViewSpan,
    segmentIndex,
    setSegmentIndex,
    setPlayheadSec,
    selectedSegment,
    setSegmentHint,
    setTileFetchWindow,
    flushTileFetch,
    handPanArmed,
    setHandPanArmed,
    onHandDragActiveChange: setHandDragActive,
    setMarkOpacity,
    seekAreaRef,
    visibleSpan,
    timeSelection,
    setTimeSelection,
    setTimeSelectionDraft,
    loopRegion,
    setLoopRegion,
  });

  const { focusDetection, onSegmentClick } = useSpectrogramFocusSelection({
    wavPath,
    projectScope: activeProjectId,
    duration,
    showSpectrogram,
    studioChrome,
    focusNav,
    primaryLabels,
    labelDeltaT,
    labelTimeUnit,
    viewStart,
    setViewStart,
    viewSpan,
    setViewSpan,
    segmentIndex,
    setSegmentIndex,
    playheadSec,
    setPlayheadSec,
    selectedSegment,
    setSelectedSegment,
    setSegmentHint,
    timeSelection,
    setTimeSelection,
    timeSelectionDraft,
    setTimeSelectionDraft,
    loopRegion,
    setLoopRegion,
    setTileError,
    setTileFetchWindow,
    timeDragRef,
  });

  const { hoverCoords, setHoverCoords, updateHoverFromClient } =
    useSpectrogramViewerHover({ coordsFromClient });

  const {
    detectionRows,
    showDetectionsPanel,
    playheadFrac,
    filteredSegmentCount,
    segmentNav,
    segmentBounds,
    viewZoomed,
    cursorFrequency,
  } = useSpectrogramViewerDerived({
    allSegments,
    overlaySegments,
    labelDeltaT,
    duration,
    labelTimeUnit,
    confidenceMin,
    wavPath,
    hiddenLabels,
    isScientific,
    labelPath,
    playheadSec,
    viewStart,
    viewEnd,
    visibleSpan,
    segmentIndex,
    viewSpan,
    hoverCoords,
    axisMaxHz,
  });

  const { exportMsg, exporting, onExportAudacity } =
    useSpectrogramAudacityExport({
      labelPath,
      wavPath,
      channel,
      orcaiParameter,
    });

  const segmentPortaled = studioChrome && segmentSlot != null;

  const {
    plotAssembly,
    simplePlot,
    detectionsTable,
    lanesPanel,
    classesFilterModal,
  } = useSpectrogramViewerNodes({
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
  });

  return buildSpectrogramChromeProps({
    meta,
    wavPath,
    channel,
    duration,
    studioChrome,
    showSpectrogram,
    isScientific,
    isProPlot,
    slots: {
      transportSlot,
      toolsSlot,
      lcdSlot,
      zoomSlot,
      segmentSlot,
      classesToolsSlot,
      classesToolsOpen,
      onClassesToolsOpenChange,
    },
    playback: {
      viewStart,
      viewSpan,
      viewEnd,
      playheadSec,
      seekToTime,
      selectedSegment,
      loopRegion,
      timeSelection,
      handleLoopRegionToggle,
      clearLoop,
      studioZoomLevel,
      setStudioZoomLevel,
      flushTileFetch,
      defaultViewSpan,
      markOpacity,
      setMarkOpacity,
      hasLabelPaths,
      resetStudioSliders,
      handPanArmed,
      toggleHandPan,
    },
    tools: {
      segmentNav,
      segmentBounds,
      viewZoomed,
      colormap,
      setColormap,
      confidenceMin,
      setConfidenceMin,
      overlayOnSpec,
      setOverlayOnSpec,
      showLanes,
      setShowLanes,
      filteredSegmentCount,
      exporting,
      onExportAudacity,
      applySegment,
      zoomIn,
      zoomOut,
      pan,
      setViewStartClamped,
      classesFilterOpen,
      setClassesFilterOpen,
      hoverCoords,
      cursorFrequency,
    },
    status: {
      tileError,
      segmentHint,
      labelsError,
      tfBoundsNotice,
      exportMsg,
    },
    classes: {
      classSidebarEntries,
      hiddenLabels,
      labelColorMap,
      showProbabilityLabels,
      setShowProbabilityLabels,
      hasLabels,
      toggleClassVisibility,
      setHiddenLabels,
      modelClasses: modelClasses ?? null,
      labelSource: labelSource ?? null,
      studioFilePicker: studioFilePicker ?? null,
      labelPath,
    },
    nodes: {
      plotAssembly,
      simplePlot,
      detectionsTable,
      lanesPanel,
      classesFilterModal,
    },
  });
}
