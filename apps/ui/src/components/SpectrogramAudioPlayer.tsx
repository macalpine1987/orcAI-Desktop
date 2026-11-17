import { SpectrogramDefaultTransport } from "./spectrogram/SpectrogramDefaultTransport";
import {
  SpectrogramAudioLogicLcd,
  SpectrogramAudioLogicOpacity,
  SpectrogramAudioLogicRightSliders,
  SpectrogramAudioLogicVolume,
  SpectrogramAudioLogicZoom,
} from "./spectrogram/SpectrogramAudioStudioControls";
import { SpectrogramAudioStudioPortals } from "./spectrogram/SpectrogramAudioStudioPortals";
import { SpectrogramAudioTransportBar } from "./spectrogram/SpectrogramAudioTransportBar";
import { useSpectrogramAudioPlayback } from "./spectrogram/useSpectrogramAudioPlayback";
import type {
  LcdTransportPhase,
  LoopRegion,
  PlayScope,
  SpectrogramAudioPlayerProps,
} from "./spectrogram/spectrogramAudioPlayerTypes";

export type { PlayScope, LcdTransportPhase, LoopRegion };
export type Props = SpectrogramAudioPlayerProps;

export function SpectrogramAudioPlayer({
  wavPath,
  channel,
  duration,
  viewStart,
  viewSpan,
  playheadSec,
  onPlayheadChange,
  lcdWindowRange = null,
  segmentRange,
  loopRegion,
  onLoopRegionToggle,
  onLoopClear,
  hasTimeSelection = false,
  disabled = false,
  sectionActive = true,
  embedded = false,
  studioTransport = false,
  transportSlot = null,
  toolsSlot = null,
  lcdSlot = null,
  zoomSlot = null,
  studioZoom,
  studioMarkOpacity,
  studioSlidersReset = null,
  studioHandPan = null,
}: SpectrogramAudioPlayerProps) {
  const p = useSpectrogramAudioPlayback({
    wavPath,
    channel,
    duration,
    viewStart,
    viewSpan,
    playheadSec,
    onPlayheadChange,
    lcdWindowRange,
    segmentRange,
    loopRegion,
    onLoopClear,
    hasTimeSelection,
    disabled,
    sectionActive,
  });

  const logicLcd = (
    <SpectrogramAudioLogicLcd
      studioTransport={studioTransport}
      playheadSec={playheadSec}
      duration={duration}
      channel={channel}
      lcdTransport={p.lcdTransport}
      lcdWindowT0={p.lcdWindowT0}
      lcdWindowT1={p.lcdWindowT1}
    />
  );
  const logicVolume = (
    <SpectrogramAudioLogicVolume
      volume={p.volume}
      canControl={p.canControl}
      onVolumeChange={p.setVolume}
    />
  );
  const logicZoom = <SpectrogramAudioLogicZoom studioZoom={studioZoom} />;
  const logicOpacity = (
    <SpectrogramAudioLogicOpacity studioMarkOpacity={studioMarkOpacity} />
  );
  const logicRightSliders = (
    <SpectrogramAudioLogicRightSliders
      studioSlidersReset={studioSlidersReset}
      studioHandPan={studioHandPan}
      volume={p.volume}
      setVolume={p.setVolume}
      logicZoom={logicZoom}
      logicVolume={logicVolume}
    />
  );
  const logicTransportBar = (
    <SpectrogramAudioTransportBar
      canControl={p.canControl}
      skipSec={p.skipSec}
      duration={duration}
      playing={p.playing}
      playPauseLabel={p.playPauseLabel}
      playPauseHint={p.playPauseHint}
      loopHint={p.loopHint}
      loopRegion={loopRegion}
      hasTimeSelection={hasTimeSelection}
      volume={p.volume}
      setVolume={p.setVolume}
      seekTo={p.seekTo}
      skipBy={p.skipBy}
      togglePlay={p.togglePlay}
      stopPlayback={p.stopPlayback}
      onLoopRegionToggle={onLoopRegionToggle}
      logicOpacity={logicOpacity}
      logicLcd={logicLcd}
      logicZoom={logicZoom}
      lcdSlot={lcdSlot}
      zoomSlot={zoomSlot}
      toolsSlot={toolsSlot}
    />
  );
  const studioShell = (
    <>
      {logicTransportBar}
      {p.loadError ? (
        <p className="predict-logic-transport-error">{p.loadError}</p>
      ) : null}
    </>
  );

  if (!p.online) {
    return (
      <p className="text-[10px] text-foreground-muted">
        {p.t("spectrogram.player.sidecarRequired")}
      </p>
    );
  }

  if (studioTransport && transportSlot) {
    return (
      <SpectrogramAudioStudioPortals
        audioElement={p.audioElement}
        studioShell={studioShell}
        logicLcd={logicLcd}
        logicRightSliders={logicRightSliders}
        logicZoom={logicZoom}
        transportSlot={transportSlot}
        lcdSlot={lcdSlot}
        toolsSlot={toolsSlot}
        zoomSlot={zoomSlot}
        onPanelKeyDown={p.onPanelKeyDown}
      />
    );
  }

  return (
    <div
      role="region"
      aria-label={p.t("spectrogram.player.ariaLabel")}
      tabIndex={0}
      onKeyDown={p.onPanelKeyDown}
      className={
        studioTransport
          ? "predict-logic-transport-host outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
          : embedded
            ? "analysis-lab-player-embedded outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            : "analysis-lab-toolbar rounded-lg border bg-subtle px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      }
    >
      {p.preparing && !p.loadError && !studioTransport && (
        <p className="mb-2 text-[10px] text-foreground-muted">
          {p.t("common.loading")}
        </p>
      )}
      {p.audioElement}
      {studioTransport ? (
        studioShell
      ) : (
        <SpectrogramDefaultTransport
          embedded={embedded}
          canControl={p.canControl}
          skipSec={p.skipSec}
          duration={duration}
          playheadSec={playheadSec}
          channel={channel}
          playing={p.playing}
          playPauseLabel={p.playPauseLabel}
          playPauseHint={p.playPauseHint}
          loopHint={p.loopHint}
          loopRegion={loopRegion}
          hasTimeSelection={hasTimeSelection}
          segmentRange={segmentRange}
          useSegmentClip={p.useSegmentClip}
          playScope={p.playScope}
          rate={p.rate}
          volume={p.volume}
          seekTo={p.seekTo}
          skipBy={p.skipBy}
          togglePlay={p.togglePlay}
          stopPlayback={p.stopPlayback}
          playDetectionClip={p.playDetectionClip}
          exitSegmentClip={p.exitSegmentClip}
          onLoopRegionToggle={onLoopRegionToggle}
          setPlayScope={p.setPlayScope}
          setSegmentClipMode={p.setSegmentClipMode}
          setRate={p.setRate}
          setVolume={p.setVolume}
          onScrub={p.onScrub}
        />
      )}
      {!embedded && !studioTransport && (
        <p className="mt-1.5 text-[9px] text-foreground-muted">
          {p.t("spectrogram.player.shortcutsHint")}
        </p>
      )}
      {p.loadError && !studioTransport && (
        <p className="mt-1 font-mono text-[10px] text-red-600 dark:text-red-400">
          {p.loadError}
        </p>
      )}
    </div>
  );
}
