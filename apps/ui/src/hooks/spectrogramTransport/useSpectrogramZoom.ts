import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import {
  SPECTROGRAM_MARK_OPACITY_DEFAULT,
  storeMarkOpacity,
} from "../../lib/spectrogramMarkOpacity";
import { clearRememberedSpectrogramView } from "../../lib/spectrogramViewMemory";
import { viewStartCenteredOnTime } from "../../lib/spectrogramViewerLogic";
import {
  SPECTROGRAM_MIN_VIEW_SPAN_SEC,
  spectrogramDefaultViewSpan,
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
  spectrogramViewSpanForZoom,
  spectrogramZoomLevel,
} from "../../lib/spectrogramView";

type Args = {
  duration: number;
  wavPath: string;
  projectScope?: string | null;
  viewStart: number;
  setViewStart: Dispatch<SetStateAction<number>>;
  viewSpan: number;
  setViewSpan: Dispatch<SetStateAction<number>>;
  segmentIndex: number;
  setSegmentIndex: Dispatch<SetStateAction<number>>;
  setPlayheadSec: Dispatch<SetStateAction<number>>;
  selectedSegment: DetectionSelection | null;
  setSegmentHint: Dispatch<SetStateAction<string | null>>;
  setTileFetchWindow: Dispatch<SetStateAction<{ t0: number; t1: number }>>;
  setMarkOpacity: Dispatch<SetStateAction<number>>;
};

export function useSpectrogramZoom({
  duration,
  wavPath,
  projectScope = null,
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
  setMarkOpacity,
}: Args) {
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
    [
      duration,
      setTileFetchWindow,
      setSegmentIndex,
      setViewStart,
      setViewSpan,
      setSegmentHint,
      setPlayheadSec,
    ],
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
    [
      defaultViewSpan,
      duration,
      zoomAnchorSec,
      setViewSpan,
      setViewStart,
      setSegmentIndex,
    ],
  );

  const resetStudioSliders = useCallback(() => {
    clearRememberedSpectrogramView(wavPath, projectScope);
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
  }, [
    defaultViewSpan,
    duration,
    wavPath,
    projectScope,
    zoomAnchorSec,
    setMarkOpacity,
    setViewSpan,
    setViewStart,
    setSegmentIndex,
    setTileFetchWindow,
  ]);

  return {
    applySegment,
    zoomIn,
    zoomOut,
    defaultViewSpan,
    studioZoomLevel,
    setStudioZoomLevel,
    resetStudioSliders,
  };
}
