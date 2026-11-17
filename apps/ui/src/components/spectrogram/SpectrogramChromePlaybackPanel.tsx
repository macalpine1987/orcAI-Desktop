import {
  SPECTROGRAM_MARK_OPACITY_DEFAULT,
  storeMarkOpacity,
} from "../../lib/spectrogramMarkOpacity";
import { SPECTROGRAM_MIN_VIEW_SPAN_SEC } from "../../lib/spectrogramView";
import { useLabSectionActive } from "../../layout/LabSectionActiveContext";
import { SpectrogramAudioPlayer } from "../SpectrogramAudioPlayer";
import type {
  SpectrogramChromePlayback,
  SpectrogramChromeSlots,
  SpectrogramChromeTools,
} from "./spectrogramViewerChromeProps";

type Props = {
  wavPath: string;
  channel: number;
  duration: number;
  studioChrome: boolean;
  isProPlot: boolean;
  slots: Pick<
    SpectrogramChromeSlots,
    "transportSlot" | "toolsSlot" | "lcdSlot" | "zoomSlot"
  >;
  playback: SpectrogramChromePlayback;
  tools: Pick<SpectrogramChromeTools, "segmentNav">;
};

/** AudioPlayer wire-up for SpectrogramViewerChrome. */
export function SpectrogramChromePlaybackPanel({
  wavPath,
  channel,
  duration,
  studioChrome,
  isProPlot,
  slots,
  playback,
  tools,
}: Props) {
  const sectionActive = useLabSectionActive();
  const { transportSlot, toolsSlot, lcdSlot, zoomSlot } = slots;
  const {
    viewStart,
    viewSpan,
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
  } = playback;
  const { segmentNav } = tools;

  return (
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
      sectionActive={sectionActive}
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
}
