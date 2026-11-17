import { storeMarkOpacity } from "../../lib/spectrogramMarkOpacity";
import { SpectrogramToolbar } from "../SpectrogramToolbar";
import type {
  SpectrogramChromeClasses,
  SpectrogramChromePlayback,
  SpectrogramChromeTools,
} from "./spectrogramViewerChromeProps";

type Props = {
  duration: number;
  isProPlot: boolean;
  isScientific: boolean;
  playback: Pick<
    SpectrogramChromePlayback,
    "viewStart" | "viewEnd" | "viewSpan" | "playheadSec" | "markOpacity" | "setMarkOpacity" | "hasLabelPaths"
  >;
  tools: SpectrogramChromeTools;
  classes: Pick<SpectrogramChromeClasses, "labelPath">;
};

/** Tools panel wire-up for SpectrogramViewerChrome. */
export function SpectrogramChromeToolsPanel({
  duration,
  isProPlot,
  isScientific,
  playback,
  tools,
  classes,
}: Props) {
  const {
    viewStart,
    viewEnd,
    viewSpan,
    playheadSec,
    markOpacity,
    setMarkOpacity,
    hasLabelPaths,
  } = playback;
  const {
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
  } = tools;
  const { labelPath } = classes;

  return (
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
}
