import type { SpectrogramTransportZoomArgs } from "./spectrogramTransport/types";
import { useSpectrogramLoopSegment } from "./spectrogramTransport/useSpectrogramLoopSegment";
import { useSpectrogramPan } from "./spectrogramTransport/useSpectrogramPan";
import { useSpectrogramZoom } from "./spectrogramTransport/useSpectrogramZoom";

export type { SpectrogramTransportZoomArgs };

/** Public transport/zoom API for spectrogram studios (compose zoom · pan · loop). */
export function useSpectrogramTransportZoom(args: SpectrogramTransportZoomArgs) {
  const zoom = useSpectrogramZoom({
    duration: args.duration,
    wavPath: args.wavPath,
    projectScope: args.projectScope,
    viewStart: args.viewStart,
    setViewStart: args.setViewStart,
    viewSpan: args.viewSpan,
    setViewSpan: args.setViewSpan,
    segmentIndex: args.segmentIndex,
    setSegmentIndex: args.setSegmentIndex,
    setPlayheadSec: args.setPlayheadSec,
    selectedSegment: args.selectedSegment,
    setSegmentHint: args.setSegmentHint,
    setTileFetchWindow: args.setTileFetchWindow,
    setMarkOpacity: args.setMarkOpacity,
  });

  const pan = useSpectrogramPan({
    duration: args.duration,
    viewStart: args.viewStart,
    setViewStart: args.setViewStart,
    viewSpan: args.viewSpan,
    segmentIndex: args.segmentIndex,
    setSegmentIndex: args.setSegmentIndex,
    handPanArmed: args.handPanArmed,
    setHandPanArmed: args.setHandPanArmed,
    setTimeSelectionDraft: args.setTimeSelectionDraft,
    seekAreaRef: args.seekAreaRef,
    visibleSpan: args.visibleSpan,
    applySegment: zoom.applySegment,
  });

  const loop = useSpectrogramLoopSegment({
    duration: args.duration,
    viewStart: args.viewStart,
    setViewStart: args.setViewStart,
    viewSpan: args.viewSpan,
    setSegmentIndex: args.setSegmentIndex,
    setPlayheadSec: args.setPlayheadSec,
    flushTileFetch: args.flushTileFetch,
    handPanArmed: args.handPanArmed,
    onHandDragActiveChange: args.onHandDragActiveChange,
    seekAreaRef: args.seekAreaRef,
    visibleSpan: args.visibleSpan,
    timeSelection: args.timeSelection,
    setTimeSelection: args.setTimeSelection,
    setTimeSelectionDraft: args.setTimeSelectionDraft,
    loopRegion: args.loopRegion,
    setLoopRegion: args.setLoopRegion,
  });

  return {
    applySegment: zoom.applySegment,
    zoomIn: zoom.zoomIn,
    zoomOut: zoom.zoomOut,
    defaultViewSpan: zoom.defaultViewSpan,
    studioZoomLevel: zoom.studioZoomLevel,
    setStudioZoomLevel: zoom.setStudioZoomLevel,
    pan: pan.pan,
    resetStudioSliders: zoom.resetStudioSliders,
    toggleHandPan: pan.toggleHandPan,
    setViewStartClamped: pan.setViewStartClamped,
    canScrollTime: pan.canScrollTime,
    seekToTime: loop.seekToTime,
    coordsFromClient: loop.coordsFromClient,
    clearLoop: loop.clearLoop,
    handleLoopRegionToggle: loop.handleLoopRegionToggle,
    onSeekPointerDown: loop.onSeekPointerDown,
    onSeekPointerMove: loop.onSeekPointerMove,
    onSeekPointerUp: loop.onSeekPointerUp,
    onSeekClick: loop.onSeekClick,
    timeDragRef: loop.timeDragRef,
  };
}
