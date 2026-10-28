import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  exportAudacityLabels,
  fetchLabelsPreview,
  type LabelsPreview,
} from "../api/labels";
import { spectrogramTileUrl, type SpectrogramMeta } from "../api/spectrogram";
import { displaySpectrogramSampleRateHz, formatDurationSec, formatSampleRateHz } from "../lib/formatAudio";
import { spectrogramAxisMaxHz } from "../lib/spectrogramAxis";
import {
  spectrogramTileNeedsViewTransform,
  spectrogramTileViewTransform,
} from "../lib/spectrogramTilePan";
import {
  resolvePlayheadSeek,
  viewStartForPlayhead,
} from "../lib/spectrogramPlayer";
import { frequencyAtCursor } from "../lib/spectrogramFrequency";
import {
  segmentBoundaryLabel,
  resolveSpectrogramPan,
  resolveSpectrogramPanFree,
  snapMinimapToSegment,
  viewDiffersFromSegment,
  viewStartCenteredOnTime,
  viewWindowForFocusedDetection,
} from "../lib/spectrogramViewerLogic";
import {
  createLabelColorMap,
  mergeLabelNames,
  publicationNameForLabel,
  type LabelLayerSource,
} from "../lib/labelColors";
import { mergeLabelColorOverrides } from "../lib/classColors";
import {
  loadStoredMarkOpacity,
  SPECTROGRAM_MARK_OPACITY_DEFAULT,
  storeMarkOpacity,
} from "../lib/spectrogramMarkOpacity";
import { effectiveLabelDeltaT, segmentTimeSec } from "../lib/segmentTime";
import { useProjectClassColors } from "../hooks/useProjectClassColors";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { isTauri } from "../platform/tauri";
import { AnnotationLanes, type LaneSegment } from "./AnnotationLanes";
import { SpectrogramAudioPlayer } from "./SpectrogramAudioPlayer";
import {
  SpectrogramOverlay,
  type OverlaySegment,
} from "./SpectrogramOverlay";
import { SpectrogramTimeAxis } from "./SpectrogramTimeAxis";
import { SpectrogramTimeNavigator } from "./SpectrogramTimeNavigator";
import { SpectrogramFrequencyAxis } from "./SpectrogramFrequencyAxis";
import { SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ } from "../lib/spectrogramAxisTicks";
import { SpectrogramAxisCorner } from "./SpectrogramAxisCorner";
import { SpectrogramColormapCanvas } from "./SpectrogramColormapCanvas";
import { SpectrogramCoordinatesBar } from "./SpectrogramCoordinatesBar";
import { SpectrogramDetectionsTable } from "./SpectrogramDetectionsTable";
import { PredictResultsClassSidebar } from "./PredictResultsClassSidebar";
import { PredictResultsClassesFilterModal } from "./PredictResultsClassesFilterModal";
import { SpectrogramToolbar } from "./SpectrogramToolbar";
import {
  detectionRowsForTable,
  type DetectionSelection,
} from "../lib/spectrogramDetections";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import {
  confidenceFractionToFloorPercent,
  floorPercentToConfidenceFraction,
  segmentPassesProbabilityFloor,
} from "../lib/spectrogramProbFloor";
import {
  clampTimeRange,
  MIN_TIME_RANGE_SEC,
  type TimeRangeSec,
} from "../lib/spectrogramTimeRange";
import { formatTfBoundsNotice } from "../lib/spectrogramTfBoundsNotice";
import { SpectrogramFileSegmentRail } from "./SpectrogramFileSegmentRail";
import { SpectrogramLabControlDeck } from "./SpectrogramLabControlDeck";
import { SpectrogramSpecHeaderBar } from "./SpectrogramSpecHeaderBar";
import { SpectrogramTimeRangeOverlay } from "./SpectrogramTimeRangeOverlay";
import { basename } from "../platform/dialog";
import {
  type SpectrogramColormap,
  SPECTROGRAM_AXIS_KIND,
  SPECTROGRAM_DISPLAY_KIND,
  SPECTROGRAM_MIN_VIEW_SPAN_SEC,
  spectrogramDefaultViewSpan,
  spectrogramNeighborTileWindows,
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
  spectrogramTilePixelWidth,
  spectrogramViewNearTileEdge,
  spectrogramViewOutsideTile,
  spectrogramViewSpanForZoom,
  spectrogramZoomLevel,
} from "../lib/spectrogramView";
import {
  invalidateSpectrogramTileCache,
  prefetchSpectrogramTileBlob,
} from "../lib/spectrogramTileCache";

/** Settle delay before swapping STFT tile when the view leaves the loaded window. */
const TILE_FETCH_DEBOUNCE_MS = 90;

const COLORMAP_STORAGE_KEY = "orcai.spectrogram.colormap";

function loadColormap(): SpectrogramColormap {
  try {
    const v = localStorage.getItem(COLORMAP_STORAGE_KEY);
    if (v === "inferno" || v === "viridis" || v === "gray") return v;
  } catch {
    /* ignore */
  }
  return "inferno";
}

type Props = {
  wavPath: string;
  meta: SpectrogramMeta;
  channel?: number;
  orcaiParameter?: string | null;
  labelPath?: string | null;
  compareLabelPath?: string | null;
  /**
   * `proLab` — full toolbar, file segment rail, coordinates bar.
   * `compact` — denser toolbar, classic time slider only.
   * `scientific` — grayscale FEROP-style plot: gray only, light canvas, axes with ticks.
   */
  layout?: "proLab" | "compact" | "scientific";
  /** Predict results studio: plot + transport only. */
  studioChrome?: boolean;
  /**
   * When false with studioChrome, skip plot/tiles/transport/class sidebar
   * and expand the detections table (Settings → Show spectrogram).
   */
  showSpectrogram?: boolean;
  /** Portal Logic Pro transport into the page toolbar. */
  transportSlot?: HTMLElement | null;
  /** Portal zoom + volume into the page toolbar. */
  toolsSlot?: HTMLElement | null;
  /** Portal time LCD into the centered toolbar slot. */
  lcdSlot?: HTMLElement | null;
  /** Optional external zoom portal (non-studio). */
  zoomSlot?: HTMLElement | null;
  /** Portal segment rail between toolbar and spectrogram. */
  segmentSlot?: HTMLElement | null;
  studioFilePicker?: {
    open: boolean;
    onToggle: () => void;
    disabled?: boolean;
    canPrev?: boolean;
    canNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
  } | null;
  /** Notify parent of primary detection count (Results tab badge). */
  onDetectionTotalChange?: (total: number | null) => void;
  /** Fired once the active viewport tile paints (neighbor warm hook). */
  onViewportReady?: () => void;
  /** Predict `-th` (0–1). Display tick only — does not rewrite the label file. */
  predictThreshold?: number | null;
  /** Classes of the model selected for this recognition. */
  modelClasses?: readonly string[] | null;
  labelSource?: {
    kind: "original" | "filtered";
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: "original" | "filtered") => void;
  } | null;
  /** Jump to a detection after navigating from Results. */
  focusNav?: DetectionFocusNav | null;
};

const VIEW_WIDTH = 900;
const SPEC_HEIGHT_DEFAULT = 280;
const LANE_HEIGHT = 48;

function tagSegments(
  preview: LabelsPreview,
  source: LabelLayerSource,
): OverlaySegment[] {
  return preview.segments.map((seg) => ({
    ...seg,
    source,
    time_unit: preview.time_unit,
  }));
}

export function SpectrogramViewer({
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
  studioFilePicker = null,
  onDetectionTotalChange,
  onViewportReady,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  focusNav = null,
}: Props) {
  const { t } = useTranslation();
  const { sidecarPort } = useSidecarStatus();
  const { colors: classColorOverrides } = useProjectClassColors();
  const duration = meta.duration_sec;
  const axisMaxHz = spectrogramAxisMaxHz(meta);
  const isScientific = layout === "scientific";
  const isProLab = layout === "proLab" || isScientific;
  const isProPlot = isProLab;
  const seekAreaRef = useRef<HTMLDivElement | null>(null);
  const plotCanvasRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(VIEW_WIDTH);
  const [plotHeight, setPlotHeight] = useState(SPEC_HEIGHT_DEFAULT);
  const specHeight = studioChrome ? plotHeight : SPEC_HEIGHT_DEFAULT;

  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState(
    () => spectrogramSegmentWindow(0, duration).viewSpan,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [tileError, setTileError] = useState<string | null>(null);
  const [tileLoading, setTileLoading] = useState(true);
  const [primaryLabels, setPrimaryLabels] = useState<LabelsPreview | null>(null);
  const [compareLabels, setCompareLabels] = useState<LabelsPreview | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [selectedSegment, setSelectedSegment] =
    useState<DetectionSelection | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [overlayOnSpec, setOverlayOnSpec] = useState(true);
  const [showLanes, setShowLanes] = useState(true);
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(() => new Set());
  const [soloLabel, setSoloLabel] = useState<string | null>(null);
  const [showProbabilityLabels, setShowProbabilityLabels] = useState(true);
  const [classesFilterOpen, setClassesFilterOpen] = useState(false);
  const [segmentHint, setSegmentHint] = useState<string | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [colormapState, setColormapState] = useState<SpectrogramColormap>(() =>
    layout === "scientific" ? "gray" : loadColormap(),
  );
  const colormap = isScientific ? "gray" : colormapState;

  const setColormap = (map: SpectrogramColormap) => {
    if (isScientific) return;
    setColormapState(map);
    try {
      localStorage.setItem(COLORMAP_STORAGE_KEY, map);
    } catch {
      /* ignore */
    }
  };
  const [confidenceMin, setConfidenceMin] = useState(0);
  useEffect(() => {
    setConfidenceMin(0);
  }, [wavPath]);
  useEffect(() => {
    if (showSpectrogram) setClassesFilterOpen(false);
  }, [showSpectrogram]);
  const [markOpacity, setMarkOpacity] = useState(loadStoredMarkOpacity);
  const [hoverCoords, setHoverCoords] = useState<{
    timeSec: number;
    yFrac: number;
  } | null>(null);
  const [tfBoundsNotice, setTfBoundsNotice] = useState<string | null>(null);
  const [timeSelectionDraft, setTimeSelectionDraft] =
    useState<TimeRangeSec | null>(null);
  /** Fixed blue time selection from LMB drag (loopable via transport Loop). */
  const [timeSelection, setTimeSelection] = useState<TimeRangeSec | null>(null);
  const [loopRegion, setLoopRegion] = useState<TimeRangeSec | null>(null);
  /** Drag-to-pan across the whole file (hand tool). */
  const [handPanArmed, setHandPanArmed] = useState(false);
  const timeDragRef = useRef<{ pointerId: number; anchorSec: number } | null>(
    null,
  );
  const handDragRef = useRef<{
    pointerId: number;
    originX: number;
    originViewStart: number;
  } | null>(null);
  const suppressSeekClickRef = useRef(false);

  const allSegments = useMemo(() => {
    const out: OverlaySegment[] = [];
    if (primaryLabels) out.push(...tagSegments(primaryLabels, "primary"));
    if (compareLabels) out.push(...tagSegments(compareLabels, "compare"));
    return out;
  }, [primaryLabels, compareLabels]);

  const segmentsAboveConfidence = useMemo(() => {
    const floor = confidenceFractionToFloorPercent(confidenceMin);
    return allSegments.filter((seg) =>
      segmentPassesProbabilityFloor(seg.mean_p, floor),
    );
  }, [allSegments, confidenceMin]);

  const overlaySegments = segmentsAboveConfidence;

  const classSidebarEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seg of overlaySegments) {
      if (seg.source !== "primary") continue;
      counts.set(seg.label, (counts.get(seg.label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }, [overlaySegments]);

  const classSidebarTotal = useMemo(
    () => classSidebarEntries.reduce((n, e) => n + e.count, 0),
    [classSidebarEntries],
  );

  const classSidebarUnfilteredTotal = useMemo(() => {
    let n = 0;
    for (const seg of allSegments) {
      if (seg.source === "primary") n += 1;
    }
    return n;
  }, [allSegments]);

  const primaryDetectionTotal = useMemo(() => {
    if (!primaryLabels) return null;
    return primaryLabels.segments.filter((seg) =>
      segmentPassesProbabilityFloor(
        seg.mean_p,
        confidenceFractionToFloorPercent(confidenceMin),
      ),
    ).length;
  }, [primaryLabels, confidenceMin]);

  useEffect(() => {
    onDetectionTotalChange?.(primaryDetectionTotal);
  }, [primaryDetectionTotal, onDetectionTotalChange]);

  const labelNames = useMemo(
    () =>
      mergeLabelNames(
        primaryLabels ? Object.keys(primaryLabels.labels) : [],
        compareLabels ? Object.keys(compareLabels.labels) : [],
      ),
    [primaryLabels, compareLabels],
  );

  const toggleClassVisibility = useCallback(
    (label: string) => {
      setHiddenLabels((prev) => {
        const next = new Set(prev);
        const pub = publicationNameForLabel(label) ?? label;
        const related = labelNames.filter((name) => {
          const namePub = publicationNameForLabel(name) ?? name;
          return name === label || namePub === pub;
        });
        const targets = related.length > 0 ? related : [label];
        const anyVisible = targets.some((name) => !prev.has(name));
        if (anyVisible) {
          for (const name of targets) next.add(name);
        } else {
          for (const name of targets) next.delete(name);
        }
        return next;
      });
      setSoloLabel(null);
    },
    [labelNames],
  );

  const labelTimeUnit =
    primaryLabels?.time_unit ?? compareLabels?.time_unit;

  const labelDeltaT = useMemo(() => {
    const raw = primaryLabels?.delta_t ?? compareLabels?.delta_t ?? null;
    const segs = [
      ...(primaryLabels?.segments ?? []),
      ...(compareLabels?.segments ?? []),
    ];
    return (
      effectiveLabelDeltaT(raw, segs, duration, labelTimeUnit) ?? raw
    );
  }, [primaryLabels, compareLabels, duration, labelTimeUnit]);

  const hasLabels = allSegments.length > 0;
  const hasLabelPaths = Boolean(
    labelPath?.trim() || compareLabelPath?.trim(),
  );

  const labelColorMap = useMemo(
    () => mergeLabelColorOverrides(createLabelColorMap(labelNames), classColorOverrides),
    [labelNames, classColorOverrides],
  );

  useEffect(() => {
    setHiddenLabels(new Set());
    setSoloLabel(null);
    setSegmentHint(null);
  }, [labelPath, compareLabelPath]);

  useEffect(() => {
    if (hasLabels) {
      setOverlayOnSpec(true);
    }
  }, [hasLabels, labelPath, compareLabelPath]);

  useEffect(() => {
    const w = spectrogramSegmentWindow(0, duration);
    setSegmentIndex(w.segmentIndex);
    setViewStart(w.viewStart);
    setViewSpan(w.viewSpan);
    setPlayheadSec(0);
    setSelectedSegment(null);
    setTimeSelectionDraft(null);
    setTimeSelection(null);
    setLoopRegion(null);
    setTileError(null);
  }, [wavPath, duration]);

  useEffect(() => {
    if (!selectedSegment) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-detection-select]")) return;
      if (target.closest("[data-detection-columns]")) return;
      if (target.closest("[data-detection-legend]")) return;
      if (target.closest("[data-detection-scope]")) return;
      // Keep selection while using transport / tools / segment rail / modals.
      if (target.closest("[data-spectrogram-chrome]")) return;
      if (target.closest("[data-spectrogram-zoom]")) return;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest(".predict-app-modal-overlay")) return;
      setSelectedSegment(null);
      setSegmentHint(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedSegment]);

  /** Clear LMB time selection / loop when clicking anywhere outside the plot. */
  useEffect(() => {
    if (
      timeSelection == null &&
      timeSelectionDraft == null &&
      loopRegion == null
    ) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (timeDragRef.current) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-spectrogram-plot]")) return;
      // Loop consumes the current selection — don't wipe it before the click.
      if (target.closest("[data-preserve-time-selection]")) return;
      setTimeSelection(null);
      setTimeSelectionDraft(null);
      setLoopRegion(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [timeSelection, timeSelectionDraft, loopRegion]);

  useEffect(() => {
    if (isScientific) return;
    try {
      localStorage.setItem(COLORMAP_STORAGE_KEY, colormapState);
    } catch {
      /* ignore */
    }
  }, [colormapState, isScientific]);

  useEffect(() => {
    invalidateSpectrogramTileCache();
    setReloadKey((k) => k + 1);
    setTileError(null);
  }, [sidecarPort]);

  useEffect(() => {
    if (!labelPath) {
      setPrimaryLabels(null);
      if (!compareLabelPath) setLabelsError(null);
      return;
    }
    const ac = new AbortController();
    setPrimaryLabels(null);
    setLabelsError(null);
    void fetchLabelsPreview(labelPath, {
      wavPath,
      channel,
      orcaiParameter: orcaiParameter ?? undefined,
      signal: ac.signal,
    })
      .then((rows) => {
        if (ac.signal.aborted) return;
        setPrimaryLabels(rows);
        setTfBoundsNotice(formatTfBoundsNotice(rows.tf_bounds, t));
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setPrimaryLabels(null);
        setLabelsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      ac.abort();
    };
  }, [labelPath, wavPath, channel, orcaiParameter, compareLabelPath, t]);

  useEffect(() => {
    if (!compareLabelPath) {
      setCompareLabels(null);
      return;
    }
    const ac = new AbortController();
    setLabelsError(null);
    void fetchLabelsPreview(compareLabelPath, {
      wavPath,
      channel,
      orcaiParameter: orcaiParameter ?? undefined,
      signal: ac.signal,
    })
      .then((rows) => {
        setCompareLabels(rows);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setCompareLabels(null);
        setLabelsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      ac.abort();
    };
  }, [compareLabelPath, wavPath, channel, orcaiParameter]);

  const initialTileWindow = () =>
    spectrogramTileOverscanWindow(
      0,
      Math.min(duration, spectrogramSegmentWindow(0, duration).viewSpan),
      duration,
    );
  const [committedTileWindow, setCommittedTileWindow] = useState(initialTileWindow);
  const [tileFetchWindow, setTileFetchWindow] = useState(initialTileWindow);
  const tileFetchWindowRef = useRef(tileFetchWindow);
  const committedTileWindowRef = useRef(committedTileWindow);
  const viewWindowRef = useRef({ t0: 0, t1: 0 });

  const viewEnd = Math.min(duration, viewStart + viewSpan);
  const visibleSpan = Math.max(0.001, viewEnd - viewStart);
  viewWindowRef.current = { t0: viewStart, t1: viewEnd };
  committedTileWindowRef.current = committedTileWindow;
  tileFetchWindowRef.current = tileFetchWindow;

  // Debounced STFT swap — CSS-pan while the view is covered; soft edge only prefetches.
  useEffect(() => {
    if (!showSpectrogram) return;
    const id = window.setTimeout(() => {
      const loaded = committedTileWindowRef.current;
      const inflight = tileFetchWindowRef.current;

      if (!spectrogramViewOutsideTile(viewStart, viewEnd, loaded)) {
        if (spectrogramViewNearTileEdge(viewStart, viewEnd, loaded)) {
          const next = spectrogramTileOverscanWindow(viewStart, viewEnd, duration);
          if (
            Math.abs(next.t0 - loaded.t0) > 1e-6 ||
            Math.abs(next.t1 - loaded.t1) > 1e-6
          ) {
            const width = spectrogramTilePixelWidth(
              plotWidth,
              next.t0,
              next.t1,
              Math.max(0.001, viewEnd - viewStart),
            );
            prefetchSpectrogramTileBlob(
              spectrogramTileUrl({
                path: wavPath,
                t0: next.t0,
                t1: next.t1,
                width,
                height: specHeight,
                channel,
                orcai_parameter: orcaiParameter ?? undefined,
                display_kind: SPECTROGRAM_DISPLAY_KIND,
                colormap: "gray",
                _epoch: reloadKey,
              }),
            );
          }
        }
        return;
      }

      // Hard miss: swap only if inflight fetch does not already cover the view.
      if (!spectrogramViewOutsideTile(viewStart, viewEnd, inflight)) {
        return;
      }
      const next = spectrogramTileOverscanWindow(viewStart, viewEnd, duration);
      setTileFetchWindow((prev) =>
        Math.abs(prev.t0 - next.t0) < 1e-6 && Math.abs(prev.t1 - next.t1) < 1e-6
          ? prev
          : next,
      );
    }, TILE_FETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [
    viewStart,
    viewEnd,
    duration,
    plotWidth,
    specHeight,
    wavPath,
    channel,
    orcaiParameter,
    reloadKey,
    showSpectrogram,
  ]);

  const tileViewTransform = spectrogramTileViewTransform({
    viewStart,
    visibleSpan,
    loadedT0: committedTileWindow.t0,
    loadedT1: committedTileWindow.t1,
    plotWidthPx: plotWidth,
  });
  const tileTransformActive = spectrogramTileNeedsViewTransform(tileViewTransform);

  useEffect(() => {
    const live = viewWindowRef.current;
    const w = spectrogramTileOverscanWindow(live.t0, live.t1, duration);
    setTileFetchWindow(w);
    setCommittedTileWindow(w);
  }, [wavPath, duration]);

  const tileRasterWidth = spectrogramTilePixelWidth(
    plotWidth,
    tileFetchWindow.t0,
    tileFetchWindow.t1,
    visibleSpan,
  );

  const tileParams = useMemo(
    () => ({
      path: wavPath,
      t0: tileFetchWindow.t0,
      t1: tileFetchWindow.t1,
      width: tileRasterWidth,
      channel,
      orcai_parameter: orcaiParameter ?? undefined,
      display_kind: SPECTROGRAM_DISPLAY_KIND,
      colormap: "gray" as const,
      _epoch: reloadKey,
    }),
    [
      wavPath,
      tileFetchWindow.t0,
      tileFetchWindow.t1,
      tileRasterWidth,
      channel,
      orcaiParameter,
      reloadKey,
    ],
  );

  const grayTileSrc = spectrogramTileUrl({
    ...tileParams,
    height: specHeight,
  });
  const tileReloadToken = `${reloadKey}-${tileFetchWindow.t0}-${tileFetchWindow.t1}-${tileRasterWidth}-${specHeight}`;

  const prefetchNeighborTiles = useCallback(
    (loaded: { t0: number; t1: number }) => {
      const [left, right] = spectrogramNeighborTileWindows(loaded, duration);
      for (const win of [left, right]) {
        if (
          Math.abs(win.t0 - loaded.t0) < 1e-6 &&
          Math.abs(win.t1 - loaded.t1) < 1e-6
        ) {
          continue;
        }
        const width = spectrogramTilePixelWidth(
          plotWidth,
          win.t0,
          win.t1,
          visibleSpan,
        );
        prefetchSpectrogramTileBlob(
          spectrogramTileUrl({
            path: wavPath,
            t0: win.t0,
            t1: win.t1,
            width,
            height: specHeight,
            channel,
            orcai_parameter: orcaiParameter ?? undefined,
            display_kind: SPECTROGRAM_DISPLAY_KIND,
            colormap: "gray",
            _epoch: reloadKey,
          }),
        );
      }
    },
    [
      channel,
      duration,
      orcaiParameter,
      plotWidth,
      reloadKey,
      specHeight,
      visibleSpan,
      wavPath,
    ],
  );

  const onTileLoading = useCallback(() => {
    setTileLoading(true);
    setTileError(null);
  }, []);

  const onTileLoaded = useCallback(() => {
    setTileLoading(false);
    setTileError(null);
    const loaded = tileFetchWindowRef.current;
    setCommittedTileWindow(loaded);
    prefetchNeighborTiles(loaded);
    onViewportReady?.();
  }, [prefetchNeighborTiles, onViewportReady]);

  const onTileFailed = useCallback(() => {
    setTileLoading(false);
    setTileError(t("spectrogram.tileLoadError"));
  }, [t]);

  const flushTileFetch = useCallback(() => {
    const live = viewWindowRef.current;
    const next = spectrogramTileOverscanWindow(live.t0, live.t1, duration);
    setTileFetchWindow(next);
  }, [duration]);

  const applySegment = useCallback(
    (index: number) => {
      const w = spectrogramSegmentWindow(index, duration);
      const segEnd = w.viewStart + w.viewSpan;
      setSegmentIndex(w.segmentIndex);
      setViewStart(w.viewStart);
      setViewSpan(w.viewSpan);
      const tile = spectrogramTileOverscanWindow(
        w.viewStart,
        segEnd,
        duration,
      );
      setTileFetchWindow(tile);
      // Keep selection when browsing segments — table «Whole file» and play-clip
      // still need the interval; only clear the hint toast.
      setSegmentHint(null);
      // Park the playhead in the new window so paused transport / seekToTime
      // cannot pan the view back to segment 0 (playhead still at t=0).
      setPlayheadSec((prev) =>
        prev >= w.viewStart && prev < segEnd ? prev : w.viewStart,
      );
    },
    [duration],
  );

  const zoomAnchorSec = useMemo(() => {
    if (selectedSegment != null) {
      return (selectedSegment.t0 + selectedSegment.t1) / 2;
    }
    return viewStart + viewSpan / 2;
  }, [selectedSegment, viewStart, viewSpan]);

  const zoomIn = () => {
    const next = Math.max(SPECTROGRAM_MIN_VIEW_SPAN_SEC, viewSpan * 0.6);
    const nextStart = viewStartCenteredOnTime(zoomAnchorSec, next, duration);
    setViewSpan(next);
    setViewStart(nextStart);
    setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
  };

  const zoomOut = () => {
    const maxSpan = spectrogramDefaultViewSpan(segmentIndex, duration);
    const next = Math.min(maxSpan, viewSpan / 0.6);
    const nextStart = viewStartCenteredOnTime(zoomAnchorSec, next, duration);
    setViewSpan(next);
    setViewStart(nextStart);
    setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
  };

  const defaultViewSpan = spectrogramDefaultViewSpan(segmentIndex, duration);
  const studioZoomLevel = spectrogramZoomLevel(viewSpan, defaultViewSpan);
  const setStudioZoomLevel = useCallback(
    (zoom: number) => {
      const next = spectrogramViewSpanForZoom(zoom, defaultViewSpan);
      const nextStart = viewStartCenteredOnTime(zoomAnchorSec, next, duration);
      setViewSpan(next);
      setViewStart(nextStart);
      setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
    },
    [defaultViewSpan, duration, zoomAnchorSec],
  );

  /** Same % mapping as playhead / time ticks — avoid CSS transform (subpixel drift). */
  const tileMediaStyle: CSSProperties = tileTransformActive
    ? {
        width: `${tileViewTransform.widthPercent}%`,
        marginLeft: `${tileViewTransform.marginLeftPercent}%`,
        willChange: "margin-left, width",
      }
    : { width: "100%" };
  const showTileLoadingOverlay = tileLoading && !tileTransformActive;

  const pan = useCallback(
    (deltaSec: number) => {
      if (handPanArmed) {
        const next = resolveSpectrogramPanFree({
          viewStart,
          viewSpan,
          durationSec: duration,
          deltaSec,
        });
        if (Math.abs(next.viewStart - viewStart) > 1e-6) {
          setViewStart(next.viewStart);
          setSegmentIndex(next.segmentIndex);
        }
        return;
      }
      const result = resolveSpectrogramPan({
        viewStart,
        viewSpan,
        segmentIndex,
        durationSec: duration,
        deltaSec,
      });
      if (result.kind === "segment") {
        applySegment(result.segmentIndex);
        return;
      }
      if (Math.abs(result.viewStart - viewStart) > 1e-6) {
        setViewStart(result.viewStart);
      }
    },
    [viewStart, viewSpan, segmentIndex, duration, applySegment, handPanArmed],
  );

  const resetStudioSliders = useCallback(() => {
    setMarkOpacity(SPECTROGRAM_MARK_OPACITY_DEFAULT);
    storeMarkOpacity(SPECTROGRAM_MARK_OPACITY_DEFAULT);
    const nextSpan = defaultViewSpan;
    const nextStart = viewStartCenteredOnTime(zoomAnchorSec, nextSpan, duration);
    setViewSpan(nextSpan);
    setViewStart(nextStart);
    setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
    setTileFetchWindow(
      spectrogramTileOverscanWindow(
        nextStart,
        nextStart + nextSpan,
        duration,
      ),
    );
  }, [defaultViewSpan, duration, zoomAnchorSec]);

  const toggleHandPan = useCallback(() => {
    setHandPanArmed((armed) => {
      const next = !armed;
      if (next) {
        setTimeSelectionDraft(null);
      }
      return next;
    });
  }, []);

  const setViewStartClamped = useCallback(
    (start: number) => {
      const snapped = snapMinimapToSegment(start, duration);
      const next = Math.max(0, Math.min(snapped, duration - viewSpan));
      setViewStart(next);
      setSegmentIndex(spectrogramSegmentIndexForStart(next, duration));
    },
    [duration, viewSpan],
  );

  const canScrollTime = viewSpan < duration - 0.01;

  useEffect(() => {
    const el = plotCanvasRef.current;
    if (!el) return;

    const syncSize = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      setPlotWidth((prev) => (prev === width ? prev : width));
      if (studioChrome) {
        const height = Math.max(160, Math.round(rect.height));
        setPlotHeight((prev) => (prev === height ? prev : height));
      } else {
        setPlotHeight((prev) =>
          prev === SPEC_HEIGHT_DEFAULT ? prev : SPEC_HEIGHT_DEFAULT,
        );
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wavPath, studioChrome]);

  useEffect(() => {
    const el = seekAreaRef.current;
    if (!el || !canScrollTime) return;

    const onWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const secPerPx = visibleSpan / Math.max(1, rect.width);
      pan(delta * secPerPx);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canScrollTime, pan, visibleSpan]);

  const seekToTime = useCallback((sec: number) => {
    const { playhead, atStart, atEnd } = resolvePlayheadSeek(sec, duration);
    setPlayheadSec(playhead);

    const nextStart = viewStartForPlayhead(
      playhead,
      viewStart,
      viewSpan,
      duration,
      atStart,
      atEnd,
    );
    if (Math.abs(nextStart - viewStart) > 1e-6) {
      setViewStart(nextStart);
      setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
    }
  }, [duration, viewSpan, viewStart]);

  const coordsFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = seekAreaRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const xFrac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const yFrac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return {
        timeSec: viewStart + xFrac * visibleSpan,
        yFrac,
      };
    },
    [viewStart, visibleSpan],
  );

  const timeSecFromClientX = useCallback(
    (clientX: number) => coordsFromClient(clientX, 0)?.timeSec ?? null,
    [coordsFromClient],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const sec = timeSecFromClientX(clientX);
      if (sec != null) seekToTime(sec);
    },
    [timeSecFromClientX, seekToTime],
  );

  const clearLoop = useCallback(() => {
    setLoopRegion(null);
    setTimeSelection(null);
    setTimeSelectionDraft(null);
  }, []);

  const handleLoopRegionToggle = useCallback(() => {
    if (loopRegion != null) {
      setLoopRegion(null);
      return;
    }
    if (timeSelection == null) return;
    setLoopRegion(timeSelection);
    seekToTime(timeSelection.t0);
  }, [loopRegion, seekToTime, timeSelection]);

  const onSeekPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Detection boxes handle their own click → table highlight; don't steal the pointer.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-detection-select]")
      ) {
        return;
      }

      if (handPanArmed) {
        handDragRef.current = {
          pointerId: e.pointerId,
          originX: e.clientX,
          originViewStart: viewStart,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const sec = timeSecFromClientX(e.clientX);
      if (sec == null) return;
      timeDragRef.current = { pointerId: e.pointerId, anchorSec: sec };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [handPanArmed, timeSecFromClientX, viewStart],
  );

  const onSeekPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const hand = handDragRef.current;
      if (hand && hand.pointerId === e.pointerId) {
        const el = seekAreaRef.current;
        if (!el) return;
        const width = Math.max(1, el.getBoundingClientRect().width);
        const deltaSec = ((hand.originX - e.clientX) / width) * visibleSpan;
        const next = resolveSpectrogramPanFree({
          viewStart: hand.originViewStart,
          viewSpan,
          durationSec: duration,
          deltaSec,
        });
        if (Math.abs(next.viewStart - viewStart) > 1e-6) {
          setViewStart(next.viewStart);
          setSegmentIndex(next.segmentIndex);
        }
        return;
      }

      const drag = timeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const sec = timeSecFromClientX(e.clientX);
      if (sec == null) return;
      // Ignore tiny jitter until the range is wide enough to count as a selection.
      if (Math.abs(sec - drag.anchorSec) < MIN_TIME_RANGE_SEC) return;
      setTimeSelectionDraft({ t0: drag.anchorSec, t1: sec });
    },
    [
      duration,
      timeSecFromClientX,
      viewSpan,
      viewStart,
      visibleSpan,
    ],
  );

  const onSeekPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const hand = handDragRef.current;
      if (hand && hand.pointerId === e.pointerId) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        const moved = Math.abs(e.clientX - hand.originX) > 3;
        handDragRef.current = null;
        if (moved) {
          suppressSeekClickRef.current = true;
          flushTileFetch();
        }
        return;
      }

      const drag = timeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const sec = timeSecFromClientX(e.clientX);
      const anchor = drag.anchorSec;
      timeDragRef.current = null;
      if (sec == null) {
        setTimeSelectionDraft(null);
        return;
      }

      const fixed = clampTimeRange(anchor, sec, duration);
      if (fixed) {
        setTimeSelection(fixed);
        setTimeSelectionDraft(null);
        // New range invalidates an active loop until Loop is pressed again.
        setLoopRegion(null);
        seekToTime(fixed.t0);
        suppressSeekClickRef.current = true;
        return;
      }

      // Click / tiny drag → seek, keep prior selection.
      setTimeSelectionDraft(null);
      seekToTime(sec);
      suppressSeekClickRef.current = true;
    },
    [
      duration,
      flushTileFetch,
      seekToTime,
      timeSecFromClientX,
    ],
  );

  const onSeekClick = useCallback(
    (e: { clientX: number }) => {
      if (suppressSeekClickRef.current) {
        suppressSeekClickRef.current = false;
        return;
      }
      if (handPanArmed) return;
      seekFromClientX(e.clientX);
    },
    [handPanArmed, seekFromClientX],
  );

  const updateHoverFromClient = useCallback(
    (clientX: number, clientY: number) => {
      setHoverCoords(coordsFromClient(clientX, clientY));
    },
    [coordsFromClient],
  );

  const focusDetection = useCallback(
    (t0: number, t1: number, label?: string) => {
      // Select first so a layout shift / focus scroll cannot drop the highlight.
      setSelectedSegment({
        t0,
        t1: Math.max(t0, t1),
        ...(label != null && label !== "" ? { label } : {}),
      });

      // Table-hero: no plot/audio — skip segment/tile/playhead churn.
      if (!showSpectrogram) return;

      const next = viewWindowForFocusedDetection(
        t0,
        t1,
        viewStart,
        viewSpan,
        segmentIndex,
        duration,
      );
      if (next.reset) {
        setSegmentIndex(next.segmentIndex);
        setViewStart(next.viewStart);
        setViewSpan(next.viewSpan);
        // Prefer tile window refresh over full cache invalidate for snappier jumps.
        const tile = spectrogramTileOverscanWindow(
          next.viewStart,
          next.viewStart + next.viewSpan,
          duration,
        );
        setTileFetchWindow(tile);
      }

      // Seek playhead using the post-focus window — do not call seekToTime with
      // a stale viewStart (it used to overwrite the segment reset above).
      const { playhead, atStart, atEnd } = resolvePlayheadSeek(t0, duration);
      setPlayheadSec(playhead);
      const panStart = viewStartForPlayhead(
        playhead,
        next.viewStart,
        next.viewSpan,
        duration,
        atStart,
        atEnd,
      );
      const seg = spectrogramSegmentWindow(next.segmentIndex, duration);
      const maxStart = Math.max(
        seg.viewStart,
        seg.viewStart + seg.viewSpan - next.viewSpan,
      );
      const clamped = Math.max(seg.viewStart, Math.min(panStart, maxStart));
      if (Math.abs(clamped - next.viewStart) > 1e-6) {
        setViewStart(clamped);
      }
    },
    [duration, viewStart, viewSpan, segmentIndex, showSpectrogram],
  );

  const focusDetectionRef = useRef(focusDetection);
  focusDetectionRef.current = focusDetection;
  useEffect(() => {
    if (!focusNav || !primaryLabels) return;
    // Do not depend on `focusDetection`: its identity includes viewStart /
    // segmentIndex, so a segment-chevron click would snap back to the row.
    focusDetectionRef.current(focusNav.t0, focusNav.t1, focusNav.label);
  }, [focusNav, primaryLabels]);

  const onSegmentClick = useCallback(
    (seg: OverlaySegment) => {
      const { t0, t1 } = segmentTimeSec(seg, labelDeltaT, duration, labelTimeUnit);
      focusDetection(t0, t1, seg.label);
      // Studio already highlights overlay + detections table; a free-floating
      // hint between the segment rail and plot created a visible seam artifact.
      if (studioChrome) {
        setSegmentHint(null);
        return;
      }
      const sourceLabel =
        seg.source === "compare"
          ? t("spectrogram.legendCompare")
          : t("spectrogram.legendPrimary");
      setSegmentHint(
        t("spectrogram.segmentHint", {
          label: seg.label,
          start: t0.toFixed(2),
          end: t1.toFixed(2),
          source: sourceLabel,
        }),
      );
    },
    [focusDetection, t, labelDeltaT, duration, labelTimeUnit, studioChrome],
  );

  const detectionRows = useMemo(
    () =>
      detectionRowsForTable(allSegments, {
        deltaT: labelDeltaT,
        durationSec: duration,
        timeUnit: labelTimeUnit,
        confidenceMin,
        primaryOnly: true,
        fileName: basename(wavPath),
        hiddenLabels,
      }),
    [
      allSegments,
      labelDeltaT,
      duration,
      labelTimeUnit,
      confidenceMin,
      wavPath,
      hiddenLabels,
    ],
  );

  const showDetectionsPanel =
    isScientific || Boolean(labelPath?.trim()) || detectionRows.length > 0;

  const playheadFrac =
    playheadSec >= viewStart && playheadSec <= viewEnd
      ? (playheadSec - viewStart) / visibleSpan
      : null;

  const onExportAudacity = async () => {
    if (!labelPath) return;
    setExporting(true);
    setExportMsg(null);
    try {
      let outputPath: string | undefined;
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const dest = await save({
          defaultPath: `${labelPath.replace(/\.txt$/i, "")}_audacity.txt`,
          filters: [{ name: "Audacity labels", extensions: ["txt"] }],
        });
        if (!dest) {
          setExporting(false);
          return;
        }
        outputPath = dest;
      }
      const result = await exportAudacityLabels({
        labelPath,
        wavPath,
        channel,
        orcaiParameter: orcaiParameter ?? undefined,
        outputPath,
      });
      if (result.output_path) {
        setExportMsg(result.output_path);
      } else if (result.content) {
        const blob = new Blob([result.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.suggested_name ?? "labels_audacity.txt";
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg(t("spectrogram.exportDownloaded"));
      }
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const filteredSegmentCount = segmentsAboveConfidence.length;

  const segmentNav = spectrogramSegmentWindow(segmentIndex, duration);
  const segmentBounds = segmentBoundaryLabel(segmentNav.segmentIndex, duration);
  const viewZoomed = viewDiffersFromSegment(
    viewStart,
    viewSpan,
    segmentNav.segmentIndex,
    duration,
  );

  const cursorFrequency = useMemo(() => {
    if (hoverCoords == null || axisMaxHz <= 0) return null;
    return frequencyAtCursor(
      SPECTROGRAM_AXIS_KIND,
      hoverCoords.yFrac,
      axisMaxHz,
    );
  }, [hoverCoords, axisMaxHz]);

  const playbackPanel = (
    <SpectrogramAudioPlayer
      wavPath={wavPath}
      channel={channel}
      duration={duration}
      viewStart={viewStart}
      viewSpan={viewSpan}
      playheadSec={playheadSec}
      onPlayheadChange={seekToTime}
      lcdWindowRange={
        studioChrome
          ? {
              t0: segmentNav.viewStart,
              t1: segmentNav.viewStart + segmentNav.viewSpan,
            }
          : null
      }
      segmentRange={selectedSegment}
      loopRegion={loopRegion}
      onLoopRegionToggle={handleLoopRegionToggle}
      onLoopClear={clearLoop}
      hasTimeSelection={timeSelection != null}
      embedded={isProPlot}
      studioTransport={studioChrome}
      transportSlot={transportSlot}
      toolsSlot={toolsSlot}
      lcdSlot={lcdSlot}
      zoomSlot={studioChrome ? null : zoomSlot}
      studioZoom={
        studioChrome
          ? {
              value: studioZoomLevel,
              onChange: setStudioZoomLevel,
              onCommit: flushTileFetch,
              disabled: defaultViewSpan <= SPECTROGRAM_MIN_VIEW_SPAN_SEC + 0.01,
            }
          : undefined
      }
      studioMarkOpacity={
        studioChrome
          ? {
              value: markOpacity,
              onChange: (value) => {
                setMarkOpacity(value);
                storeMarkOpacity(value);
              },
              disabled: !hasLabelPaths,
            }
          : undefined
      }
      studioSlidersReset={
        studioChrome
          ? {
              onReset: resetStudioSliders,
              atDefault:
                studioZoomLevel <= 0.001 &&
                markOpacity === SPECTROGRAM_MARK_OPACITY_DEFAULT,
            }
          : null
      }
      studioHandPan={
        studioChrome
          ? {
              armed: handPanArmed,
              onToggle: toggleHandPan,
            }
          : null
      }
    />
  );

  const transportPortaled = studioChrome && showSpectrogram && transportSlot != null;
  const toolsPortaled = studioChrome && showSpectrogram && toolsSlot != null;
  const segmentPortaled = studioChrome && segmentSlot != null;

  const studioFileRateHz = displaySpectrogramSampleRateHz(meta);
  const studioFileRateLabel = (() => {
    if (studioFileRateHz == null || !Number.isFinite(studioFileRateHz)) {
      return null;
    }
    if (studioFileRateHz >= 1000) {
      const khz = studioFileRateHz / 1000;
      const value =
        Math.abs(khz - Math.round(khz)) < 0.05
          ? String(Math.round(khz))
          : khz.toFixed(1);
      return t("projects.studio.kHz", { value });
    }
    return formatSampleRateHz(studioFileRateHz);
  })();
  const studioFileMeta = [
    studioFileRateLabel,
    channel > 0 ? t("spectrogram.specHeader.channel", { channel }) : null,
    duration > 0 ? formatDurationSec(duration) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const studioSegmentRail =
    studioChrome && duration > 0 ? (
      <SpectrogramFileSegmentRail
        studioLayout
        fileNavOnly={!showSpectrogram}
        durationSec={duration}
        viewStart={viewStart}
        viewSpan={viewSpan}
        segmentIndex={segmentNav.segmentIndex}
        onViewStartChange={setViewStartClamped}
        onSegmentSelect={applySegment}
        fileName={basename(wavPath)}
        fileMeta={studioFileMeta || null}
        onFileMenuToggle={
          studioFilePicker ? studioFilePicker.onToggle : null
        }
        fileMenuOpen={studioFilePicker?.open ?? false}
        fileMenuDisabled={studioFilePicker?.disabled ?? false}
        onFilePrev={studioFilePicker?.onPrev ?? null}
        onFileNext={studioFilePicker?.onNext ?? null}
        canFilePrev={studioFilePicker?.canPrev ?? false}
        canFileNext={studioFilePicker?.canNext ?? false}
        onClassesFilterToggle={
          !showSpectrogram
            ? () => setClassesFilterOpen((open) => !open)
            : null
        }
        classesFilterOpen={classesFilterOpen}
        labelSource={labelSource}
      />
    ) : null;

  // Opacity + zoom + volume portal into the page toolbar via SpectrogramAudioPlayer.
  const studioToolsBar = null;

  const toolsPanel = (
    <SpectrogramToolbar
      compact={!isProPlot}
      embedded={isProPlot}
      logicPro={isScientific}
      hideColormap={isScientific}
      segmentIndex={segmentNav.segmentIndex}
      segmentTotal={segmentNav.segmentTotal}
      segmentT0={segmentBounds.t0}
      segmentT1={segmentBounds.t1}
      viewZoomed={viewZoomed}
      viewStart={viewStart}
      viewEnd={viewEnd}
      duration={duration}
      playheadSec={playheadSec}
      colormap={colormap}
      confidenceMin={confidenceMin}
      markOpacity={markOpacity}
      hasLabels={hasLabelPaths}
      overlayOnSpec={overlayOnSpec}
      showLanes={showLanes}
      segmentCount={filteredSegmentCount}
      exporting={exporting}
      canSegmentPrev={segmentNav.segmentIndex > 0}
      canSegmentNext={segmentNav.segmentIndex < segmentNav.segmentTotal - 1}
      canPanPrev={viewStart > 0}
      canPanNext={viewEnd < duration}
      canExport={Boolean(labelPath)}
      onSegmentPrev={() => applySegment(segmentNav.segmentIndex - 1)}
      onSegmentNext={() => applySegment(segmentNav.segmentIndex + 1)}
      onColormapChange={setColormap}
      onConfidenceMinChange={setConfidenceMin}
      onMarkOpacityChange={(value) => {
        setMarkOpacity(value);
        storeMarkOpacity(value);
      }}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onPanPrev={() => pan(-viewSpan * 0.25)}
      onPanNext={() => pan(viewSpan * 0.25)}
      onOverlayToggle={() => setOverlayOnSpec((v) => !v)}
      onLanesToggle={() => setShowLanes((v) => !v)}
      onExport={() => void onExportAudacity()}
    />
  );

  const segmentRailPanel = (
    <SpectrogramFileSegmentRail
      durationSec={duration}
      viewStart={viewStart}
      viewSpan={viewSpan}
      segmentIndex={segmentNav.segmentIndex}
      onViewStartChange={setViewStartClamped}
      onSegmentSelect={applySegment}
    />
  );

  const coordinatesPanel = (
    <SpectrogramCoordinatesBar
      timeSec={hoverCoords?.timeSec ?? playheadSec}
      frequencyLabel={cursorFrequency?.display ?? null}
      segmentIndex={segmentNav.segmentIndex}
    />
  );

  const plotAssembly = (
    <div
      className={
        studioChrome
          ? "analysis-spectrogram-studio-with-sidebar"
          : undefined
      }
    >
    <div
      className={`analysis-spectrogram-plot-assembly${isScientific ? " analysis-spectrogram-scientific" : ""}${studioChrome ? " analysis-spectrogram-studio" : ""}`}
    >
      {studioChrome && !segmentPortaled ? (
        <SpectrogramSpecHeaderBar
          fileName={basename(wavPath)}
          sampleRateHz={displaySpectrogramSampleRateHz(meta)}
          channel={channel}
          durationSec={duration}
        />
      ) : null}
      <div className="analysis-spectrogram-plot-frame">
      <div className="analysis-spectrogram-plot-row">
        <SpectrogramFrequencyAxis
          axisMaxHz={axisMaxHz}
          height={specHeight}
          unitInCorner={isScientific}
          compactEdgeLabels={isScientific}
          autoTick={false}
          labelStepKhz={
            isScientific ? SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ : undefined
          }
        />
        <div
          ref={plotCanvasRef}
          className="analysis-spectrogram-canvas relative min-h-0 min-w-0"
        >
          <div className="analysis-spectrogram-stage">
            <div className="analysis-spectrogram-media">
              <div
                ref={seekAreaRef}
                role="button"
                tabIndex={0}
                data-spectrogram-plot=""
                className={`relative w-full ${
                  handPanArmed
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-crosshair"
                } ${canScrollTime ? "touch-pan-x" : ""}`}
                style={
                  studioChrome
                    ? { height: "100%", minHeight: 160 }
                    : { height: specHeight }
                }
                title={
                  handPanArmed
                    ? t("spectrogram.toolbar.handPanArmedHint")
                    : canScrollTime
                      ? `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")} · ${t("spectrogram.scrollHint")}`
                      : `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")}`
                }
                onPointerDown={onSeekPointerDown}
                onPointerMove={onSeekPointerMove}
                onPointerUp={onSeekPointerUp}
                onPointerCancel={onSeekPointerUp}
                onClick={onSeekClick}
                onMouseMove={(e) => updateHoverFromClient(e.clientX, e.clientY)}
                onMouseLeave={() => setHoverCoords(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    seekToTime(viewStart + viewSpan / 2);
                  }
                }}
              >
                <div
                  className={`relative h-full w-full${
                    isScientific ? " overflow-visible" : " overflow-hidden"
                  }`}
                >
                  <div className="relative h-full" style={tileMediaStyle}>
                    <SpectrogramColormapCanvas
                      grayTileUrl={grayTileSrc}
                      colormap={colormap}
                      invert={isScientific}
                      reloadToken={tileReloadToken}
                      fileKey={wavPath}
                      width={plotWidth}
                      height={specHeight}
                      alt={t("spectrogram.placeholderTitle")}
                      className={`pointer-events-none block w-full select-none ${isScientific ? "bg-[#ececec]" : "bg-black"}`}
                      onLoading={onTileLoading}
                      onLoaded={onTileLoaded}
                      onFailed={onTileFailed}
                    />
                    {showTileLoadingOverlay ? (
                      <div
                        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-xs ${isScientific ? "bg-[#ececec]/80 text-foreground-muted" : "bg-black/60 text-foreground-muted"}`}
                        aria-live="polite"
                      >
                        {t("common.loading")}
                      </div>
                    ) : null}
                  </div>
                </div>
                {overlayOnSpec && hasLabels && (
                  <SpectrogramOverlay
                    segments={overlaySegments}
                    labelNames={labelNames}
                    viewStart={viewStart}
                    viewSpan={visibleSpan}
                    durationSec={duration}
                    deltaT={labelDeltaT}
                    timeUnit={labelTimeUnit}
                    colorMap={labelColorMap}
                    hiddenLabels={hiddenLabels}
                    soloLabel={soloLabel}
                    selectedSegment={selectedSegment}
                    markOpacity={markOpacity}
                    showProbabilityLabels={showProbabilityLabels}
                    nyquistHz={axisMaxHz}
                    layoutSize={{ w: plotWidth, h: specHeight }}
                    onSegmentClick={onSegmentClick}
                  />
                )}
                {loopRegion && !timeSelectionDraft ? (
                  <SpectrogramTimeRangeOverlay
                    range={loopRegion}
                    viewStart={viewStart}
                    viewSpan={visibleSpan}
                    variant="loop"
                  />
                ) : null}
                {timeSelectionDraft || (!loopRegion && timeSelection) ? (
                  <SpectrogramTimeRangeOverlay
                    range={timeSelectionDraft ?? timeSelection!}
                    viewStart={viewStart}
                    viewSpan={visibleSpan}
                    variant="draft"
                  />
                ) : null}
                {playheadFrac != null && (
                  <div
                    className="analysis-playhead"
                    style={{ left: `${playheadFrac * 100}%` }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="analysis-spectrogram-plot-footer flex min-w-0 gap-0">
        <SpectrogramAxisCorner
          frequencyUnit={
            isScientific ? t("spectrogram.frequencyAxis.unit") : undefined
          }
        />
        <SpectrogramTimeAxis
          viewStart={viewStart}
          viewEnd={viewEnd}
          plotWidthPx={plotWidth}
          autoTick={isScientific}
        />
      </div>
      </div>
    </div>
    {studioChrome ? (
      <PredictResultsClassSidebar
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
        showProbability={showProbabilityLabels}
        showAnnotations={overlayOnSpec}
        annotationsAvailable={hasLabels}
        onToggle={toggleClassVisibility}
        onShowProbabilityChange={setShowProbabilityLabels}
        // Product: «Аннотации» = recognition label overlays (not expert compare layer).
        onShowAnnotationsChange={setOverlayOnSpec}
      />
    ) : null}
    </div>
  );

  const controlDeck =
    transportPortaled ? null : (
    <SpectrogramLabControlDeck
      playback={playbackPanel}
      tools={studioChrome ? null : toolsPanel}
      segmentRail={studioChrome ? null : segmentRailPanel}
      coordinates={studioChrome ? null : coordinatesPanel}
      logicPro={isScientific}
      plotAbove={isScientific && !studioChrome}
    />
  );

  return (
    <>
      {!isProPlot ? (
        <>
          {playbackPanel}
          {toolsPanel}
        </>
      ) : null}

      {tileError && (
        <p className="font-mono text-[10px] text-foreground">{tileError}</p>
      )}

      {segmentHint && !studioChrome ? (
        <p className="font-mono text-[10px] text-foreground-muted">{segmentHint}</p>
      ) : null}

      {(labelsError || (tfBoundsNotice && !studioChrome)) && (
        <p
          className={`font-mono text-[10px] ${
            labelsError
              ? "text-amber-800 dark:text-amber-200"
              : "text-foreground-muted"
          }`}
        >
          {labelsError ?? tfBoundsNotice}
        </p>
      )}

      {exportMsg && (
        <p className="break-all font-mono text-[10px] text-foreground-muted">
          {exportMsg}
        </p>
      )}

      {transportPortaled ? playbackPanel : null}
      {toolsPortaled && studioToolsBar
        ? createPortal(studioToolsBar, toolsSlot)
        : studioChrome && !toolsPortaled && studioToolsBar
          ? (
            <div className="predict-results-studio-tools-fallback px-2 py-1">
              {studioToolsBar}
            </div>
          )
          : null}
      {segmentPortaled && studioSegmentRail
        ? createPortal(studioSegmentRail, segmentSlot)
        : null}

      {isProPlot && !isScientific ? controlDeck : null}

      {showSpectrogram || !studioChrome ? (
        <div
          className={
            studioChrome
              ? "analysis-spectrogram-studio-stack"
              : "flex flex-col"
          }
        >
          {showSpectrogram && isProPlot ? (
            <>
              {isScientific ? plotAssembly : null}
              {isScientific ? (
                studioChrome ? null : controlDeck
              ) : (
                plotAssembly
              )}
            </>
          ) : showSpectrogram ? (
            <div className="flex min-w-0 flex-1 gap-2">
              <div className="relative min-w-0 flex-1 overflow-hidden rounded border border-border bg-black">
                <div
                  ref={seekAreaRef}
                  role="button"
                  tabIndex={0}
                  data-spectrogram-plot=""
                  className={`relative w-full ${
                    handPanArmed
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-crosshair"
                  } ${canScrollTime ? "touch-pan-x" : ""}`}
                  style={
                    studioChrome
                      ? { height: "100%", minHeight: 160 }
                      : { height: specHeight }
                  }
                  title={
                    handPanArmed
                      ? t("spectrogram.toolbar.handPanArmedHint")
                      : canScrollTime
                        ? `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")} · ${t("spectrogram.scrollHint")}`
                        : `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")}`
                  }
                  onPointerDown={onSeekPointerDown}
                  onPointerMove={onSeekPointerMove}
                  onPointerUp={onSeekPointerUp}
                  onPointerCancel={onSeekPointerUp}
                  onClick={onSeekClick}
                  onMouseMove={(e) => updateHoverFromClient(e.clientX, e.clientY)}
                  onMouseLeave={() => setHoverCoords(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      seekToTime(viewStart + viewSpan / 2);
                    }
                  }}
                >
                  <div
                    className={`relative h-full w-full${
                      isScientific ? " overflow-visible" : " overflow-hidden"
                    }`}
                  >
                    <div className="relative h-full" style={tileMediaStyle}>
                      <SpectrogramColormapCanvas
                        grayTileUrl={grayTileSrc}
                        colormap={colormap}
                        invert={isScientific}
                        reloadToken={tileReloadToken}
                        fileKey={wavPath}
                        width={plotWidth}
                        height={specHeight}
                        alt={t("spectrogram.placeholderTitle")}
                        className="pointer-events-none block w-full select-none bg-black"
                        onLoading={onTileLoading}
                        onLoaded={onTileLoaded}
                        onFailed={onTileFailed}
                      />
                      {showTileLoadingOverlay ? (
                        <div
                          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-foreground-muted"
                          aria-live="polite"
                        >
                          {t("common.loading")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {overlayOnSpec && hasLabels && (
                    <SpectrogramOverlay
                      segments={overlaySegments}
                      labelNames={labelNames}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      durationSec={duration}
                      deltaT={labelDeltaT}
                      timeUnit={labelTimeUnit}
                      colorMap={labelColorMap}
                      hiddenLabels={hiddenLabels}
                      soloLabel={soloLabel}
                      selectedSegment={selectedSegment}
                      markOpacity={markOpacity}
                      showProbabilityLabels={showProbabilityLabels}
                      nyquistHz={axisMaxHz}
                      layoutSize={{ w: plotWidth, h: specHeight }}
                      onSegmentClick={onSegmentClick}
                    />
                  )}
                  {loopRegion && !timeSelectionDraft ? (
                    <SpectrogramTimeRangeOverlay
                      range={loopRegion}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      variant="loop"
                    />
                  ) : null}
                  {timeSelectionDraft || (!loopRegion && timeSelection) ? (
                    <SpectrogramTimeRangeOverlay
                      range={timeSelectionDraft ?? timeSelection!}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      variant="draft"
                    />
                  ) : null}
                  {playheadFrac != null && (
                    <div
                      className="analysis-playhead"
                      style={{ left: `${playheadFrac * 100}%` }}
                      aria-hidden
                    />
                  )}
                </div>
                <SpectrogramTimeNavigator
                  durationSec={duration}
                  viewStart={viewStart}
                  viewSpan={viewSpan}
                  onViewStartChange={setViewStartClamped}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showDetectionsPanel ? (
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
      ) : null}

      {!studioChrome && showLanes && (
        <div className="analysis-lanes-panel border-t border-border bg-surface px-1 py-0.5">
          {labelsError && (
            <p className="px-2 py-1 font-mono text-[10px] text-foreground">
              {labelsError}
            </p>
          )}
          {allSegments.length > 0 ? (
            <AnnotationLanes
              segments={segmentsAboveConfidence as LaneSegment[]}
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
      )}

      {studioChrome && !showSpectrogram ? (
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
      ) : null}

    </>
  );
}
