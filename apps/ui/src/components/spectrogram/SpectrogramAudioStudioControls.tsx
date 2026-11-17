import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SpectrogramMarkOpacityControl } from "../SpectrogramMarkOpacityControl";
import { SpectrogramVolumeControl } from "../SpectrogramVolumeControl";
import { SpectrogramZoomSlider } from "../SpectrogramZoomSlider";
import { IconCircularReset, IconHand } from "../SpectrogramIcons";
import { SpectrogramLogicLcd } from "./SpectrogramLogicLcd";
import { SpectrogramTransportButton as TransportButton } from "./SpectrogramTransportButton";
import {
  STUDIO_VOLUME_DEFAULT,
  type LcdTransportPhase,
  type SpectrogramAudioPlayerProps,
} from "./spectrogramAudioPlayerTypes";

type StudioZoom = NonNullable<SpectrogramAudioPlayerProps["studioZoom"]>;
type StudioMarkOpacity = NonNullable<
  SpectrogramAudioPlayerProps["studioMarkOpacity"]
>;
type StudioSlidersReset = NonNullable<
  SpectrogramAudioPlayerProps["studioSlidersReset"]
>;
type StudioHandPan = NonNullable<SpectrogramAudioPlayerProps["studioHandPan"]>;

export function SpectrogramAudioLogicLcd({
  studioTransport,
  playheadSec,
  duration,
  channel,
  lcdTransport,
  lcdWindowT0,
  lcdWindowT1,
}: {
  studioTransport: boolean;
  playheadSec: number;
  duration: number;
  channel: number;
  lcdTransport: LcdTransportPhase;
  lcdWindowT0: number;
  lcdWindowT1: number;
}): ReactNode {
  return (
    <SpectrogramLogicLcd
      studioTransport={studioTransport}
      playheadSec={playheadSec}
      duration={duration}
      channel={channel}
      lcdTransport={lcdTransport}
      lcdWindowT0={lcdWindowT0}
      lcdWindowT1={lcdWindowT1}
    />
  );
}

export function SpectrogramAudioLogicVolume({
  volume,
  canControl,
  onVolumeChange,
}: {
  volume: number;
  canControl: boolean;
  onVolumeChange: (value: number) => void;
}): ReactNode {
  return (
    <div className="predict-logic-studio-volume" data-spectrogram-chrome="">
      <SpectrogramVolumeControl
        logicPro
        value={volume}
        disabled={!canControl}
        onChange={onVolumeChange}
      />
    </div>
  );
}

export function SpectrogramAudioLogicZoom({
  studioZoom,
}: {
  studioZoom?: StudioZoom;
}): ReactNode {
  if (studioZoom == null) return null;
  return (
    <div className="predict-logic-studio-zoom" data-spectrogram-chrome="">
      <SpectrogramZoomSlider
        value={studioZoom.value}
        onChange={studioZoom.onChange}
        onCommit={studioZoom.onCommit}
        disabled={studioZoom.disabled}
      />
    </div>
  );
}

export function SpectrogramAudioLogicOpacity({
  studioMarkOpacity,
}: {
  studioMarkOpacity?: StudioMarkOpacity;
}): ReactNode {
  if (studioMarkOpacity == null) return null;
  return (
    <div className="predict-logic-studio-opacity" data-spectrogram-chrome="">
      <SpectrogramMarkOpacityControl
        logicPro
        value={studioMarkOpacity.value}
        onChange={studioMarkOpacity.onChange}
        disabled={studioMarkOpacity.disabled}
      />
    </div>
  );
}

export function SpectrogramAudioLogicRightSliders({
  studioSlidersReset,
  studioHandPan,
  volume,
  setVolume,
  logicZoom,
  logicVolume,
}: {
  studioSlidersReset?: StudioSlidersReset | null;
  studioHandPan?: StudioHandPan | null;
  volume: number;
  setVolume: (value: number) => void;
  logicZoom: ReactNode;
  logicVolume: ReactNode;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="predict-logic-studio-right-sliders">
      {studioSlidersReset || studioHandPan ? (
        <div
          className="predict-logic-studio-view-tools"
          role="group"
          aria-label={t("spectrogram.toolbar.viewToolsAria")}
        >
          {studioSlidersReset ? (
            <TransportButton
              logicPro
              className="predict-logic-sliders-reset-btn"
              label={t("spectrogram.toolbar.slidersResetAll")}
              hint={t("spectrogram.toolbar.slidersResetAllHint")}
              disabled={
                studioSlidersReset.atDefault &&
                Math.abs(volume - STUDIO_VOLUME_DEFAULT) < 0.001
              }
              onClick={() => {
                setVolume(STUDIO_VOLUME_DEFAULT);
                studioSlidersReset.onReset();
              }}
            >
              <IconCircularReset size={22} />
            </TransportButton>
          ) : null}
          {studioHandPan ? (
            <button
              type="button"
              aria-label={t("spectrogram.toolbar.handPan")}
              title={
                studioHandPan.armed
                  ? t("spectrogram.toolbar.handPanArmedHint")
                  : t("spectrogram.toolbar.handPanHint")
              }
              aria-pressed={studioHandPan.armed}
              onClick={studioHandPan.onToggle}
              className="predict-logic-transport-btn predict-logic-hand-btn"
            >
              <IconHand size={22} />
            </button>
          ) : null}
        </div>
      ) : null}
      {logicZoom}
      {logicVolume}
    </div>
  );
}
