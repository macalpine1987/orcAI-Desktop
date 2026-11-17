/**
 * Grouped prop contracts for SpectrogramViewerChrome (ISP).
 * Shell builds these bags; chrome stays presentational.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SpectrogramMeta } from "../../api/spectrogram";
import type { LabelColorMap } from "../../lib/labelColors";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";
import type { SpectrogramColormap } from "../../lib/spectrogramView";
import type { SpectrogramViewerProps } from "./spectrogramViewerTypes";

export type SpectrogramChromeSlots = {
  transportSlot: HTMLElement | null;
  toolsSlot: HTMLElement | null;
  lcdSlot: HTMLElement | null;
  zoomSlot: HTMLElement | null;
  segmentSlot: HTMLElement | null;
  classesToolsSlot: HTMLElement | null;
  classesToolsOpen?: boolean;
  onClassesToolsOpenChange?: (open: boolean) => void;
};

export type SpectrogramChromePlayback = {
  viewStart: number;
  viewSpan: number;
  viewEnd: number;
  playheadSec: number;
  seekToTime: (sec: number) => void;
  selectedSegment: DetectionSelection | null;
  loopRegion: TimeRangeSec | null;
  timeSelection: TimeRangeSec | null;
  handleLoopRegionToggle: () => void;
  clearLoop: () => void;
  studioZoomLevel: number;
  setStudioZoomLevel: (value: number) => void;
  flushTileFetch: () => void;
  defaultViewSpan: number;
  markOpacity: number;
  setMarkOpacity: Dispatch<SetStateAction<number>>;
  hasLabelPaths: boolean;
  resetStudioSliders: () => void;
  handPanArmed: boolean;
  toggleHandPan: () => void;
};

export type SpectrogramChromeTools = {
  segmentNav: {
    segmentIndex: number;
    segmentTotal: number;
    viewStart: number;
    viewSpan: number;
  };
  segmentBounds: { t0: number; t1: number };
  viewZoomed: boolean;
  colormap: SpectrogramColormap;
  setColormap: (map: SpectrogramColormap) => void;
  confidenceMin: number;
  setConfidenceMin: Dispatch<SetStateAction<number>>;
  overlayOnSpec: boolean;
  setOverlayOnSpec: Dispatch<SetStateAction<boolean>>;
  showLanes: boolean;
  setShowLanes: Dispatch<SetStateAction<boolean>>;
  filteredSegmentCount: number;
  exporting: boolean;
  onExportAudacity: () => void | Promise<void>;
  applySegment: (index: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  pan: (delta: number) => void;
  setViewStartClamped: (start: number) => void;
  classesFilterOpen: boolean;
  setClassesFilterOpen: Dispatch<SetStateAction<boolean>>;
  hoverCoords: { timeSec: number; yFrac: number } | null;
  cursorFrequency: { display: string } | null;
};

export type SpectrogramChromeStatus = {
  tileError: string | null;
  segmentHint: string | null;
  labelsError: string | null;
  tfBoundsNotice: string | null;
  exportMsg: string | null;
};

export type SpectrogramChromeClasses = {
  classSidebarEntries: Array<{ label: string; count: number }>;
  hiddenLabels: Set<string>;
  labelColorMap: LabelColorMap;
  showProbabilityLabels: boolean;
  setShowProbabilityLabels: Dispatch<SetStateAction<boolean>>;
  hasLabels: boolean;
  toggleClassVisibility: (label: string) => void;
  setHiddenLabels: Dispatch<SetStateAction<Set<string>>>;
  modelClasses: SpectrogramViewerProps["modelClasses"];
  labelSource: NonNullable<SpectrogramViewerProps["labelSource"]> | null;
  studioFilePicker: NonNullable<SpectrogramViewerProps["studioFilePicker"]> | null;
  labelPath: string | null;
};

export type SpectrogramChromeNodes = {
  plotAssembly: ReactNode;
  simplePlot: ReactNode;
  detectionsTable: ReactNode;
  lanesPanel: ReactNode;
  classesFilterModal: ReactNode;
};

export type SpectrogramViewerChromeProps = {
  meta: SpectrogramMeta;
  wavPath: string;
  channel: number;
  duration: number;
  studioChrome: boolean;
  showSpectrogram: boolean;
  isScientific: boolean;
  isProPlot: boolean;
  slots: SpectrogramChromeSlots;
  playback: SpectrogramChromePlayback;
  tools: SpectrogramChromeTools;
  status: SpectrogramChromeStatus;
  classes: SpectrogramChromeClasses;
  nodes: SpectrogramChromeNodes;
};
