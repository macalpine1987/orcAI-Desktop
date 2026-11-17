import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  IconLoop,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconStop,
  IconToEnd,
  IconToStart,
} from "../SpectrogramIcons";
import { SpectrogramVolumeControl } from "../SpectrogramVolumeControl";
import { SpectrogramTransportButton as TransportButton } from "./SpectrogramTransportButton";
import type { LoopRegion } from "./spectrogramAudioPlayerTypes";

type Props = {
  canControl: boolean;
  skipSec: number;
  duration: number;
  playing: boolean;
  playPauseLabel: string;
  playPauseHint: string;
  loopHint: string;
  loopRegion: LoopRegion | null;
  hasTimeSelection: boolean;
  volume: number;
  setVolume: (value: number) => void;
  seekTo: (sec: number, options?: { pause?: boolean }) => void;
  skipBy: (delta: number) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  onLoopRegionToggle: () => void;
  logicOpacity: ReactNode;
  logicLcd: ReactNode;
  logicZoom: ReactNode;
  lcdSlot: HTMLElement | null;
  zoomSlot: HTMLElement | null;
  toolsSlot: HTMLElement | null;
};

export function SpectrogramAudioTransportBar({
  canControl,
  skipSec,
  duration,
  playing,
  playPauseLabel,
  playPauseHint,
  loopHint,
  loopRegion,
  hasTimeSelection,
  volume,
  setVolume,
  seekTo,
  skipBy,
  togglePlay,
  stopPlayback,
  onLoopRegionToggle,
  logicOpacity,
  logicLcd,
  logicZoom,
  lcdSlot,
  zoomSlot,
  toolsSlot,
}: Props) {
  const { t } = useTranslation();

  const playPauseTransportButton = (
    <TransportButton
      logicPro
      label={playPauseLabel}
      hint={playPauseHint}
      disabled={!canControl}
      onClick={togglePlay}
    >
      {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
    </TransportButton>
  );

  const loopTransportButton = (
    <TransportButton
      logicPro
      preserveTimeSelection
      className="predict-logic-loop-btn"
      label={t("spectrogram.player.loop")}
      hint={loopHint}
      disabled={!canControl || (loopRegion == null && !hasTimeSelection)}
      pressed={loopRegion != null}
      onClick={onLoopRegionToggle}
    >
      <IconLoop size={22} />
    </TransportButton>
  );

  return (
    <div
      className="predict-logic-transport"
      role="group"
      aria-label={t("spectrogram.player.ariaLabel")}
      data-spectrogram-chrome=""
    >
      <div className="predict-logic-transport-cluster">
        <TransportButton
          logicPro
          label={t("spectrogram.player.toStart")}
          hint={t("spectrogram.player.toStartHint")}
          disabled={!canControl}
          onClick={() => seekTo(0)}
        >
          <IconToStart />
        </TransportButton>
        <TransportButton
          logicPro
          label={t("spectrogram.player.skipBack", { sec: skipSec })}
          hint={t("spectrogram.player.skipBackHint", { sec: skipSec })}
          disabled={!canControl}
          onClick={() => skipBy(-skipSec)}
        >
          <IconSkipBack />
        </TransportButton>
        {playPauseTransportButton}
        <TransportButton
          logicPro
          label={t("spectrogram.player.skipForward", { sec: skipSec })}
          hint={t("spectrogram.player.skipForwardHint", { sec: skipSec })}
          disabled={!canControl}
          onClick={() => skipBy(skipSec)}
        >
          <IconSkipForward />
        </TransportButton>
        <TransportButton
          logicPro
          label={t("spectrogram.player.toEnd")}
          hint={t("spectrogram.player.toEndHint")}
          disabled={!canControl}
          onClick={() => seekTo(duration)}
        >
          <IconToEnd />
        </TransportButton>
        <TransportButton
          logicPro
          label={t("spectrogram.stop")}
          hint={t("spectrogram.player.stopHint")}
          disabled={!canControl}
          onClick={stopPlayback}
        >
          <IconStop />
        </TransportButton>
        <div
          className="predict-logic-transport-divider"
          role="separator"
          aria-orientation="vertical"
        />
        {loopTransportButton}
      </div>

      {logicOpacity}

      {!lcdSlot ? logicLcd : null}

      {!zoomSlot && !toolsSlot && logicZoom ? (
        <div className="predict-logic-transport-cluster predict-logic-transport-cluster-end">
          {logicZoom}
        </div>
      ) : null}

      {!toolsSlot ? (
        <SpectrogramVolumeControl
          logicPro
          value={volume}
          disabled={!canControl}
          onChange={setVolume}
        />
      ) : null}
    </div>
  );
}
