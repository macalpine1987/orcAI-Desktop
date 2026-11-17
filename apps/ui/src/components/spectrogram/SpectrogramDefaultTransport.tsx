import { useTranslation } from "react-i18next";
import { formatPlayerClock } from "../../lib/spectrogramPlayer";
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

type PlayScope = "file" | "view" | "segment";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type SegmentRange = { t0: number; t1: number };
type LoopRegion = { t0: number; t1: number };

type Props = {
  embedded: boolean;
  canControl: boolean;
  skipSec: number;
  duration: number;
  playheadSec: number;
  channel: number;
  playing: boolean;
  playPauseLabel: string;
  playPauseHint: string;
  loopHint: string;
  loopRegion: LoopRegion | null;
  hasTimeSelection: boolean;
  segmentRange: SegmentRange | null;
  useSegmentClip: boolean;
  playScope: PlayScope;
  rate: number;
  volume: number;
  seekTo: (sec: number) => void;
  skipBy: (delta: number) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  playDetectionClip: () => void;
  exitSegmentClip: () => void;
  onLoopRegionToggle: () => void;
  setPlayScope: (scope: PlayScope) => void;
  setSegmentClipMode: (value: boolean) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  onScrub: (sec: number) => void;
};

export function SpectrogramDefaultTransport({
  embedded,
  canControl,
  skipSec,
  duration,
  playheadSec,
  channel,
  playing,
  playPauseLabel,
  playPauseHint,
  loopHint,
  loopRegion,
  hasTimeSelection,
  segmentRange,
  useSegmentClip,
  playScope,
  rate,
  volume,
  seekTo,
  skipBy,
  togglePlay,
  stopPlayback,
  playDetectionClip,
  exitSegmentClip,
  onLoopRegionToggle,
  setPlayScope,
  setSegmentClipMode,
  setRate,
  setVolume,
  onScrub,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className={embedded ? "analysis-transport" : undefined}>
      <div
        className={
          embedded
            ? "analysis-transport-main"
            : "flex flex-wrap items-center gap-1.5"
        }
      >
        <div
          className={
            embedded
              ? "analysis-transport-cluster"
              : "flex flex-wrap items-center gap-1.5"
          }
        >
          <TransportButton
            embedded={embedded}
            label={t("spectrogram.player.toStart")}
            hint={t("spectrogram.player.toStartHint")}
            disabled={!canControl}
            onClick={() => seekTo(0)}
          >
            <IconToStart />
          </TransportButton>
          <TransportButton
            embedded={embedded}
            label={t("spectrogram.player.skipBack", { sec: skipSec })}
            hint={t("spectrogram.player.skipBackHint", { sec: skipSec })}
            disabled={!canControl}
            onClick={() => skipBy(-skipSec)}
          >
            <IconSkipBack />
          </TransportButton>
          <TransportButton
            embedded={embedded}
            label={t("spectrogram.player.skipForward", { sec: skipSec })}
            hint={t("spectrogram.player.skipForwardHint", { sec: skipSec })}
            disabled={!canControl}
            onClick={() => skipBy(skipSec)}
          >
            <IconSkipForward />
          </TransportButton>
          <TransportButton
            embedded={embedded}
            label={t("spectrogram.player.toEnd")}
            hint={t("spectrogram.player.toEndHint")}
            disabled={!canControl}
            onClick={() => seekTo(duration)}
          >
            <IconToEnd />
          </TransportButton>
          {embedded ? (
            <div
              className="analysis-transport-divider"
              role="separator"
              aria-orientation="vertical"
            />
          ) : null}
          <TransportButton
            embedded={embedded}
            label={playPauseLabel}
            hint={playPauseHint}
            disabled={!canControl}
            pressed={playing}
            onClick={togglePlay}
          >
            {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
          </TransportButton>
          <TransportButton
            embedded={embedded}
            label={t("spectrogram.stop")}
            hint={t("spectrogram.player.stopHint")}
            disabled={!canControl}
            onClick={stopPlayback}
          >
            <IconStop />
          </TransportButton>
        </div>

        {!embedded && (
          <div
            className="mx-1 hidden h-7 w-px shrink-0 bg-border sm:block"
            role="separator"
            aria-orientation="vertical"
          />
        )}

        <div
          className={
            embedded
              ? "analysis-transport-clock"
              : "min-w-[7.5rem] px-1 font-mono text-[11px] tabular-nums text-foreground"
          }
          aria-live="polite"
        >
          <strong>{formatPlayerClock(playheadSec)}</strong>
          <span className="text-foreground-muted">
            {" "}
            / {formatPlayerClock(duration)}
          </span>
        </div>

        <div
          className={
            embedded
              ? "analysis-transport-options"
              : "flex flex-wrap items-center gap-1.5"
          }
        >
          {segmentRange && (
            <>
              <button
                type="button"
                disabled={!canControl}
                onClick={playDetectionClip}
                title={t("spectrogram.playDetection")}
                className={
                  embedded
                    ? "analysis-transport-chip"
                    : "rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:opacity-35"
                }
              >
                {t("spectrogram.playDetection")}
              </button>
              {useSegmentClip && (
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={exitSegmentClip}
                  title={t("spectrogram.player.fullFileHint")}
                  className={
                    embedded
                      ? "analysis-transport-chip analysis-transport-chip--accent"
                      : "rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-35"
                  }
                >
                  {t("spectrogram.player.fullFile")}
                </button>
              )}
            </>
          )}

          <TransportButton
            embedded={embedded}
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

          {!embedded && (
            <div
              className="mx-1 hidden h-7 w-px shrink-0 bg-border md:block"
              role="separator"
              aria-orientation="vertical"
            />
          )}

          <label className="flex items-center gap-1 text-[10px] text-foreground-muted">
            <span className="sr-only">{t("spectrogram.playScope")}</span>
            <select
              value={playScope}
              disabled={!canControl}
              onChange={(e) => {
                const next = e.target.value as PlayScope;
                setPlayScope(next);
                if (next !== "segment") {
                  setSegmentClipMode(false);
                }
              }}
              title={t("spectrogram.playScope")}
              className="max-w-[8rem] rounded border border-border bg-surface px-1 py-0.5 text-[10px]"
            >
              <option value="file">{t("spectrogram.scopeFile")}</option>
              <option value="view">{t("spectrogram.scopeView")}</option>
              {segmentRange && (
                <option value="segment">
                  {t("spectrogram.scopeDetection")}
                </option>
              )}
            </select>
          </label>

          <label className="flex items-center gap-1 text-[10px] text-foreground-muted">
            <span>{t("spectrogram.speed")}</span>
            <select
              value={rate}
              disabled={!canControl}
              onChange={(e) => setRate(Number(e.target.value))}
              className="rounded border border-border bg-surface px-1 py-0.5 text-[10px]"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>

          <SpectrogramVolumeControl
            value={volume}
            disabled={!canControl}
            onChange={setVolume}
          />

          <span className="shrink-0 text-[10px] text-foreground-muted">
            {t("spectrogram.player.channel", { channel })}
          </span>
        </div>
      </div>

      <label
        className={
          embedded
            ? "analysis-transport-scrub"
            : "mt-2 flex items-center gap-2"
        }
      >
        <span className="sr-only">{t("spectrogram.player.timeline")}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={playheadSec}
          disabled={!canControl}
          onChange={(e) => onScrub(Number(e.target.value))}
          className={
            embedded ? undefined : "h-2 flex-1 cursor-pointer accent-accent"
          }
        />
      </label>
    </div>
  );
}
