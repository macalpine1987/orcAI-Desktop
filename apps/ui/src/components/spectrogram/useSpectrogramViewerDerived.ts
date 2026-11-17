import { useMemo } from "react";
import { frequencyAtCursor } from "../../lib/spectrogramFrequency";
import {
  segmentBoundaryLabel,
  viewDiffersFromSegment,
} from "../../lib/spectrogramViewerLogic";
import {
  detectionRowsForTable,
  type DetectionSegmentInput,
} from "../../lib/spectrogramDetections";
import { basename } from "../../platform/dialog";
import {
  SPECTROGRAM_AXIS_KIND,
  spectrogramSegmentWindow,
} from "../../lib/spectrogramView";
import type { LabelTimeUnit } from "../../api/labels";
import type { SpectrogramHoverCoords } from "./useSpectrogramViewerHover";

type Options = {
  allSegments: DetectionSegmentInput[];
  overlaySegments: DetectionSegmentInput[];
  labelDeltaT: number | null | undefined;
  duration: number;
  labelTimeUnit: LabelTimeUnit | undefined;
  confidenceMin: number;
  wavPath: string;
  hiddenLabels: Set<string>;
  isScientific: boolean;
  labelPath: string | null | undefined;
  playheadSec: number;
  viewStart: number;
  viewEnd: number;
  visibleSpan: number;
  segmentIndex: number;
  viewSpan: number;
  hoverCoords: SpectrogramHoverCoords | null;
  axisMaxHz: number;
};

/** Table rows, segment nav/bounds, cursor Hz, playhead frac, panel visibility. */
export function useSpectrogramViewerDerived({
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
}: Options) {
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

  const filteredSegmentCount = overlaySegments.length;

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

  return {
    detectionRows,
    showDetectionsPanel,
    playheadFrac,
    filteredSegmentCount,
    segmentNav,
    segmentBounds,
    viewZoomed,
    cursorFrequency,
  };
}
