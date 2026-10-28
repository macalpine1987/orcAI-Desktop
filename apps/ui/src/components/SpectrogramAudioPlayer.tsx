import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { audioPlaybackUrl, audioSegmentUrl } from "../api/audio";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import {
  clampPlayhead,
  DEFAULT_SKIP_SEC,
  formatPlayerClock,
  formatStudioLcdClock,
  resolvePlayheadSeek,
  skipPlayhead,
  splitPlayerClock,
} from "../lib/spectrogramPlayer";
import { SpectrogramMarkOpacityControl } from "./SpectrogramMarkOpacityControl";
import { SpectrogramVolumeControl } from "./SpectrogramVolumeControl";
import { SpectrogramZoomSlider } from "./SpectrogramZoomSlider";
import {
  IconLoop,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconStop,
  IconToEnd,
  IconToStart,
  IconCircularReset,
  IconHand,
} from "./SpectrogramIcons";

export type PlayScope = "file" | "view" | "segment";

type SegmentRange = { t0: number; t1: number };
export type LoopRegion = { t0: number; t1: number };

const STUDIO_VOLUME_DEFAULT = 1;

type Props = {
  wavPath: string;
  channel: number;
  duration: number;
  viewStart: number;
  viewSpan: number;
  playheadSec: number;
  onPlayheadChange: (sec: number) => void;
  /**
   * LCD «окно» bounds (mockup: current file segment, not zoomed view).
   * When omitted, falls back to viewStart–viewEnd.
   */
  lcdWindowRange?: SegmentRange | null;
  segmentRange: SegmentRange | null;
  /** Fixed loop interval from spectrogram selection (enables looped playback). */
  loopRegion: LoopRegion | null;
  onLoopRegionToggle: () => void;
  /** Clear loop + selection (Stop). */
  onLoopClear?: () => void;
  /** Blue time selection exists — Loop can lock it. */
  hasTimeSelection?: boolean;
  disabled?: boolean;
  /** Render inside unified control deck (no separate card chrome). */
  embedded?: boolean;
  /** Predict results: Logic Pro transport — no speed/scope/detection controls. */
  studioTransport?: boolean;
  /** Portal transport UI into the page toolbar slot. */
  transportSlot?: HTMLElement | null;
  /** Portal zoom + volume into the right tools slot. */
  toolsSlot?: HTMLElement | null;
  /** Portal time LCD into the centered toolbar slot. */
  lcdSlot?: HTMLElement | null;
  /** Portal zoom slider (non-studio layouts). Studio uses toolsSlot. */
  zoomSlot?: HTMLElement | null;
  /** Predict results: zoom slider (0 = default span, 1 = max zoom-in). */
  studioZoom?: {
    value: number;
    onChange: (value: number) => void;
    /** Flush high-res tile fetch (slider pointerup / reset). */
    onCommit?: () => void;
    disabled?: boolean;
  };
  /** Predict results: mark opacity after transport buttons. */
  studioMarkOpacity?: {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  };
  /** Reset contrast + zoom (volume resets locally in the player). */
  studioSlidersReset?: {
    onReset: () => void;
    atDefault: boolean;
  } | null;
  /** Free-hand pan across the whole file. */
  studioHandPan?: {
    armed: boolean;
    onToggle: () => void;
  } | null;
};

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function TransportButton({
  label,
  hint,
  disabled,
  pressed,
  primary,
  embedded,
  logicPro,
  preserveTimeSelection,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
  embedded?: boolean;
  logicPro?: boolean;
  /** Keep spectrogram time selection when this control is pressed (e.g. Loop). */
  preserveTimeSelection?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  if (logicPro) {
    return (
      <button
        type="button"
        aria-label={label}
        title={hint}
        disabled={disabled}
        aria-pressed={pressed}
        data-preserve-time-selection={
          preserveTimeSelection ? "" : undefined
        }
        onClick={onClick}
        className="predict-logic-transport-btn"
      >
        {children}
      </button>
    );
  }

  if (embedded) {
    return (
      <button
        type="button"
        aria-label={label}
        title={hint}
        disabled={disabled}
        aria-pressed={pressed}
        data-preserve-time-selection={
          preserveTimeSelection ? "" : undefined
        }
        onClick={onClick}
        className="analysis-transport-btn"
      >
        {children}
      </button>
    );
  }

  const size = primary ? "h-9 w-9" : "h-8 w-8";
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      data-preserve-time-selection={
        preserveTimeSelection ? "" : undefined
      }
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 ${size} ${
        pressed
          ? "border-accent bg-accent/15 text-accent"
          : primary
            ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
            : "border-border bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

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
}: Props) {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSegmentPlayRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [playScope, setPlayScope] = useState<PlayScope>("file");
  const [volume, setVolume] = useState(STUDIO_VOLUME_DEFAULT);
  const [rate, setRate] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [segmentClipMode, setSegmentClipMode] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const viewEnd = Math.min(duration, viewStart + viewSpan);
  const lcdWindowT0 = lcdWindowRange?.t0 ?? viewStart;
  const lcdWindowT1 = lcdWindowRange?.t1 ?? viewEnd;
  const skipSec = DEFAULT_SKIP_SEC;
  const canControl = online && Boolean(audioSrc) && !disabled;

  const useSegmentClip =
    segmentRange != null &&
    (segmentClipMode || playScope === "segment");

  useEffect(() => {
    setPlaying(false);
    setLoadError(null);
    setSegmentClipMode(false);
    pendingSegmentPlayRef.current = false;
  }, [wavPath, channel]);

  useEffect(() => {
    if (!segmentRange && playScope === "segment") {
      setPlayScope("file");
    }
  }, [segmentRange, playScope]);

  useEffect(() => {
    if (!online || !wavPath) {
      setAudioSrc(null);
      setPreparing(false);
      return;
    }
    setPreparing(true);
    if (useSegmentClip && segmentRange) {
      setAudioSrc(
        audioSegmentUrl(wavPath, channel, segmentRange.t0, segmentRange.t1),
      );
    } else {
      setAudioSrc(audioPlaybackUrl(wavPath, channel));
    }
    setPreparing(false);
  }, [online, wavPath, channel, useSegmentClip, segmentRange]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
    el.playbackRate = rate;
  }, [volume, rate, audioSrc]);

  useEffect(() => {
    if (useSegmentClip) return;
    const el = audioRef.current;
    if (!el || playing) return;
    if (Math.abs(el.currentTime - playheadSec) > 0.25) {
      el.currentTime = playheadSec;
    }
  }, [playheadSec, playing, useSegmentClip]);

  const pausePlayback = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
    setPlaying(false);
  }, []);

  const seekTo = useCallback(
    (sec: number, options?: { pause?: boolean }) => {
      const { playhead } = resolvePlayheadSeek(sec, duration);
      onPlayheadChange(playhead);
      const el = audioRef.current;
      if (el && !useSegmentClip) {
        el.currentTime = playhead;
      } else if (el && useSegmentClip && segmentRange) {
        el.currentTime = Math.max(0, playhead - segmentRange.t0);
      }
      if (options?.pause !== false) {
        pausePlayback();
      }
    },
    [duration, onPlayheadChange, pausePlayback, segmentRange, useSegmentClip],
  );

  const skipBy = useCallback(
    (delta: number) => {
      seekTo(skipPlayhead(playheadSec, delta, duration));
    },
    [duration, playheadSec, seekTo],
  );

  const stopPlayback = useCallback(() => {
    onLoopClear?.();
    seekTo(0);
  }, [onLoopClear, seekTo]);

  const exitSegmentClip = useCallback(() => {
    pendingSegmentPlayRef.current = false;
    pausePlayback();
    setSegmentClipMode(false);
    if (playScope === "segment") {
      setPlayScope("file");
    }
  }, [pausePlayback, playScope]);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;

    if (loopRegion && !useSegmentClip) {
      onPlayheadChange(el.currentTime);
      if (el.currentTime >= loopRegion.t1 - 0.02) {
        el.currentTime = loopRegion.t0;
        onPlayheadChange(loopRegion.t0);
      }
      return;
    }

    if (useSegmentClip && segmentRange) {
      const abs = segmentRange.t0 + el.currentTime;
      onPlayheadChange(abs);
      if (el.currentTime >= el.duration - 0.05) {
        pausePlayback();
      }
      return;
    }

    onPlayheadChange(el.currentTime);

    if (playScope === "view" && el.currentTime >= viewEnd - 0.02) {
      pausePlayback();
      return;
    }

    if (el.ended) {
      pausePlayback();
    }
  }, [
    loopRegion,
    onPlayheadChange,
    pausePlayback,
    playScope,
    segmentRange,
    useSegmentClip,
    viewEnd,
    viewStart,
  ]);

  const startPlayback = useCallback(async () => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;

    if (useSegmentClip && segmentRange) {
      el.currentTime = Math.max(0, playheadSec - segmentRange.t0);
    } else if (loopRegion) {
      if (playheadSec < loopRegion.t0 || playheadSec >= loopRegion.t1) {
        el.currentTime = loopRegion.t0;
        onPlayheadChange(loopRegion.t0);
      } else {
        el.currentTime = playheadSec;
      }
    } else if (playScope === "view") {
      if (playheadSec < viewStart || playheadSec >= viewEnd) {
        el.currentTime = viewStart;
        onPlayheadChange(viewStart);
      } else {
        el.currentTime = playheadSec;
      }
    } else {
      el.currentTime = playheadSec;
    }

    try {
      const playPromise = el.play();
      setPlaying(true);
      setLoadError(null);
      await playPromise;
    } catch (err) {
      setPlaying(false);
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [
    audioSrc,
    onPlayheadChange,
    playScope,
    loopRegion,
    playheadSec,
    segmentRange,
    useSegmentClip,
    viewEnd,
    viewStart,
  ]);

  useEffect(() => {
    if (!pendingSegmentPlayRef.current || !segmentClipMode || !audioSrc) return;
    const el = audioRef.current;
    if (!el) return;

    const run = () => {
      pendingSegmentPlayRef.current = false;
      void startPlayback();
    };

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      run();
      return;
    }
    el.addEventListener("canplay", run, { once: true });
    return () => el.removeEventListener("canplay", run);
  }, [segmentClipMode, audioSrc, startPlayback]);

  const togglePlay = useCallback(() => {
    if (playing) {
      pausePlayback();
      return;
    }
    void startPlayback();
  }, [pausePlayback, playing, startPlayback]);

  const playDetectionClip = useCallback(() => {
    if (!segmentRange) return;
    pendingSegmentPlayRef.current = true;
    pausePlayback();
    setPlayScope("segment");
    setSegmentClipMode(true);
  }, [pausePlayback, segmentRange]);

  const onScrub = (value: number) => {
    const sec = clampPlayhead(value, duration);
    onPlayheadChange(sec);
    const el = audioRef.current;
    if (el && !useSegmentClip) {
      el.currentTime = sec;
    } else if (el && useSegmentClip && segmentRange) {
      el.currentTime = Math.max(0, sec - segmentRange.t0);
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !canControl) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "Home":
        e.preventDefault();
        seekTo(0);
        break;
      case "End":
        e.preventDefault();
        seekTo(duration);
        break;
      case "ArrowLeft":
        e.preventDefault();
        skipBy(e.shiftKey ? -1 : -skipSec);
        break;
      case "ArrowRight":
        e.preventDefault();
        skipBy(e.shiftKey ? 1 : skipSec);
        break;
      default:
        break;
    }
  };

  const audioElement = audioSrc ? (
    <audio
      ref={audioRef}
      src={audioSrc}
      preload="metadata"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onTimeUpdate={onTimeUpdate}
      onLoadedData={() => setPreparing(false)}
      onError={() => {
        setPreparing(false);
        setPlaying(false);
        setLoadError(t("spectrogram.player.loadError"));
      }}
    />
  ) : null;

  const playPauseLabel = playing
    ? t("spectrogram.player.pause")
    : t("spectrogram.player.play");
  const playPauseHint = playing
    ? t("spectrogram.player.pauseHint")
    : t("spectrogram.player.playHint");

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

  const loopHint =
    loopRegion != null
      ? t("spectrogram.player.loopClearHint")
      : hasTimeSelection
        ? t("spectrogram.player.loopFixHint")
        : t("spectrogram.player.loopHint");

  const loopTransportButton = (
    <TransportButton
      logicPro
      preserveTimeSelection
      label={t("spectrogram.player.loop")}
      hint={loopHint}
      disabled={!canControl || (loopRegion == null && !hasTimeSelection)}
      pressed={loopRegion != null}
      onClick={onLoopRegionToggle}
    >
      <IconLoop />
    </TransportButton>
  );

  const logicLcd = (() => {
    /** m04: three separate LCD plates — title above, compact MM:SS (or channel). */
    if (studioTransport) {
      const panel = (
        title: string,
        value: string,
        opts?: { dim?: boolean; channel?: boolean },
      ) => (
        <div
          className={`predict-logic-lcd-panel${opts?.dim ? " is-dim" : ""}${
            opts?.channel ? " is-channel" : ""
          }`}
          aria-label={`${title} ${value}`}
        >
          <div className="predict-logic-lcd-panel-title">{title}</div>
          <div className="predict-logic-lcd-panel-value">{value}</div>
        </div>
      );
      return (
        <div className="predict-logic-lcd predict-logic-lcd--m04" aria-live="polite">
          {panel(t("predict.results.lcdPosition"), formatStudioLcdClock(playheadSec))}
          {panel(t("predict.results.lcdDuration"), formatStudioLcdClock(duration), {
            dim: true,
          })}
          {panel(t("predict.results.lcdChannel"), String(channel), {
            channel: true,
          })}
        </div>
      );
    }

    const pos = splitPlayerClock(playheadSec);
    const len = splitPlayerClock(duration);
    const showHours = pos.hours > 0 || len.hours > 0;
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const cell = (value: string, label: string, opts?: { dim?: boolean; wide?: boolean }) => (
      <div
        className={`predict-logic-lcd-cell${opts?.wide ? " is-wide" : ""}${opts?.dim ? " is-dim" : ""}`}
      >
        <span className="predict-logic-lcd-cell-value">{value}</span>
        <span className="predict-logic-lcd-cell-label">{label}</span>
      </div>
    );
    const group = (
      title: string,
      children: ReactNode,
      opts?: { dim?: boolean; view?: boolean },
    ) => (
      <div
        className={`predict-logic-lcd-group${opts?.dim ? " is-dim" : ""}${opts?.view ? " is-view" : ""}`}
        aria-label={title}
      >
        <div className="predict-logic-lcd-group-title">{title}</div>
        <div className="predict-logic-lcd-group-cells">{children}</div>
      </div>
    );
    return (
      <div className="predict-logic-lcd" aria-live="polite">
        {group(
          t("predict.results.lcdPosition"),
          <>
            {showHours ? cell(String(pos.hours), t("predict.results.lcdHr")) : null}
            {cell(pad2(pos.minutes), t("predict.results.lcdMin"))}
            {cell(pad2(pos.seconds), t("predict.results.lcdSec"))}
            {cell(`.${pos.tenths}`, t("predict.results.lcdDs"))}
          </>,
        )}
        <div className="predict-logic-lcd-divider" aria-hidden />
        {group(
          t("predict.results.lcdDuration"),
          <>
            {showHours
              ? cell(String(len.hours), t("predict.results.lcdHr"), { dim: true })
              : null}
            {cell(pad2(len.minutes), t("predict.results.lcdMin"), { dim: true })}
            {cell(pad2(len.seconds), t("predict.results.lcdSec"), { dim: true })}
            {cell(`.${len.tenths}`, t("predict.results.lcdDs"), { dim: true })}
          </>,
          { dim: true },
        )}
        <div className="predict-logic-lcd-divider" aria-hidden />
        {group(
          t("predict.results.lcdViewLabel"),
          cell(
            `${lcdWindowT0.toFixed(0)}–${lcdWindowT1.toFixed(0)}`,
            "с",
            { dim: true, wide: true },
          ),
          { dim: true, view: true },
        )}
      </div>
    );
  })();

  const logicVolume = (
    <div className="predict-logic-studio-volume" data-spectrogram-chrome="">
      <SpectrogramVolumeControl
        logicPro
        value={volume}
        disabled={!canControl}
        onChange={setVolume}
      />
    </div>
  );

  const logicZoom =
    studioZoom != null ? (
      <div className="predict-logic-studio-zoom" data-spectrogram-chrome="">
        <SpectrogramZoomSlider
          value={studioZoom.value}
          onChange={studioZoom.onChange}
          onCommit={studioZoom.onCommit}
          disabled={studioZoom.disabled}
        />
      </div>
    ) : null;

  const logicOpacity =
    studioMarkOpacity != null ? (
      <div className="predict-logic-studio-opacity" data-spectrogram-chrome="">
        <SpectrogramMarkOpacityControl
          logicPro
          value={studioMarkOpacity.value}
          onChange={studioMarkOpacity.onChange}
          disabled={studioMarkOpacity.disabled}
        />
      </div>
    ) : null;

  const logicRightSliders = (
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
              <IconCircularReset size={16} />
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
              <IconHand size={20} />
            </button>
          ) : null}
        </div>
      ) : null}
      {logicZoom}
      {logicVolume}
    </div>
  );

  const logicTransportBar = (
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

  const studioShell = (
    <>
      {logicTransportBar}
      {loadError ? (
        <p className="predict-logic-transport-error">{loadError}</p>
      ) : null}
    </>
  );

  const defaultTransport = (
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
            label={t("spectrogram.player.loop")}
            hint={loopHint}
            disabled={!canControl || (loopRegion == null && !hasTimeSelection)}
            pressed={loopRegion != null}
            onClick={onLoopRegionToggle}
          >
            <IconLoop />
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

  if (!online) {
    return (
      <p className="text-[10px] text-foreground-muted">
        {t("spectrogram.player.sidecarRequired")}
      </p>
    );
  }

  if (studioTransport && transportSlot) {
    return (
      <>
        <div className="predict-results-transport-host" aria-hidden tabIndex={-1}>
          {audioElement}
        </div>
        {createPortal(
          <div
            role="region"
            aria-label={t("spectrogram.player.ariaLabel")}
            tabIndex={0}
            onKeyDown={onPanelKeyDown}
            className="predict-logic-transport-host outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
          >
            {studioShell}
          </div>,
          transportSlot,
        )}
        {lcdSlot
          ? createPortal(
              <div className="predict-logic-lcd-host">{logicLcd}</div>,
              lcdSlot,
            )
          : null}
        {toolsSlot ? createPortal(logicRightSliders, toolsSlot) : null}
        {zoomSlot && logicZoom && !toolsSlot
          ? createPortal(logicZoom, zoomSlot)
          : null}
      </>
    );
  }

  return (
    <div
      role="region"
      aria-label={t("spectrogram.player.ariaLabel")}
      tabIndex={0}
      onKeyDown={onPanelKeyDown}
      className={
        studioTransport
          ? "predict-logic-transport-host outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
          : embedded
            ? "analysis-lab-player-embedded outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            : "analysis-lab-toolbar rounded-lg border bg-subtle px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      }
    >
      {preparing && !loadError && !studioTransport && (
        <p className="mb-2 text-[10px] text-foreground-muted">
          {t("common.loading")}
        </p>
      )}

      {audioElement}

      {studioTransport ? studioShell : defaultTransport}

      {!embedded && !studioTransport && (
        <p className="mt-1.5 text-[9px] text-foreground-muted">
          {t("spectrogram.player.shortcutsHint")}
        </p>
      )}

      {loadError && !studioTransport && (
        <p className="mt-1 font-mono text-[10px] text-red-600 dark:text-red-400">
          {loadError}
        </p>
      )}
    </div>
  );
}
