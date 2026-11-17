import { formatUserFacingErrorRequired } from "../../lib/userFacingError";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { audioPlaybackUrl, audioSegmentUrl } from "../../api/audio";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import {
  loadRememberedStudioVolume,
  rememberStudioVolume,
} from "../../lib/spectrogramViewMemory";
import {
  clampPlayhead,
  DEFAULT_SKIP_SEC,
  resolvePlayheadSeek,
  skipPlayhead,
} from "../../lib/spectrogramPlayer";
import type {
  LcdTransportPhase,
  PlayScope,
  SpectrogramAudioPlayerProps,
} from "./spectrogramAudioPlayerTypes";

type PlaybackArgs = Pick<
  SpectrogramAudioPlayerProps,
  | "wavPath"
  | "channel"
  | "duration"
  | "viewStart"
  | "viewSpan"
  | "playheadSec"
  | "onPlayheadChange"
  | "lcdWindowRange"
  | "segmentRange"
  | "loopRegion"
  | "onLoopClear"
  | "hasTimeSelection"
  | "disabled"
  | "sectionActive"
>;

export function useSpectrogramAudioPlayback({
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
  onLoopClear,
  hasTimeSelection = false,
  disabled = false,
  sectionActive = true,
}: PlaybackArgs) {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSegmentPlayRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [lcdTransport, setLcdTransport] = useState<LcdTransportPhase>("idle");
  const [playScope, setPlayScope] = useState<PlayScope>("file");
  const [volume, setVolume] = useState(loadRememberedStudioVolume);
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
    rememberStudioVolume(volume);
  }, [volume]);

  useEffect(() => {
    setPlaying(false);
    setLcdTransport("idle");
    setLoadError(null);
    setSegmentClipMode(false);
    pendingSegmentPlayRef.current = false;
  }, [wavPath, channel]);

  // Keep-alive: leave Recognition → pause so audio does not play in the background.
  useEffect(() => {
    if (sectionActive) return;
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    setPlaying(false);
    setLcdTransport((phase) => (phase === "playing" ? "paused" : phase));
  }, [sectionActive]);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (!el) return;
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, []);

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

  // Keep audio in sync with external seeks (spectrogram click / playhead move),
  // including while playing — otherwise timeupdate snaps the line back.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (useSegmentClip && segmentRange) {
      const rel = Math.max(0, playheadSec - segmentRange.t0);
      if (Math.abs(el.currentTime - rel) > 0.25) {
        el.currentTime = rel;
      }
      return;
    }
    if (useSegmentClip) return;
    if (Math.abs(el.currentTime - playheadSec) > 0.25) {
      el.currentTime = playheadSec;
    }
  }, [playheadSec, useSegmentClip, segmentRange]);

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
    setLcdTransport("idle");
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
        setLcdTransport("idle");
      }
      return;
    }

    onPlayheadChange(el.currentTime);

    if (playScope === "view" && el.currentTime >= viewEnd - 0.02) {
      pausePlayback();
      setLcdTransport("idle");
      return;
    }

    if (el.ended) {
      pausePlayback();
      setLcdTransport("idle");
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
      setLcdTransport("playing");
      setLoadError(null);
      await playPromise;
    } catch (err) {
      setPlaying(false);
      setLcdTransport("idle");
      setLoadError(formatUserFacingErrorRequired(err, t));
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
    t,
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
      setLcdTransport("paused");
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

  const audioElement: ReactNode = audioSrc ? (
    <audio
      ref={audioRef}
      src={audioSrc}
      preload="metadata"
      onPlay={() => {
        setPlaying(true);
        setLcdTransport("playing");
      }}
      onPause={() => setPlaying(false)}
      onTimeUpdate={onTimeUpdate}
      onLoadedData={() => setPreparing(false)}
      onError={() => {
        setPreparing(false);
        setPlaying(false);
        setLcdTransport("idle");
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

  const loopHint =
    loopRegion != null
      ? t("spectrogram.player.loopClearHint")
      : hasTimeSelection
        ? t("spectrogram.player.loopFixHint")
        : t("spectrogram.player.loopHint");

  return {
    t,
    online,
    audioRef,
    pendingSegmentPlayRef,
    playing,
    lcdTransport,
    playScope,
    setPlayScope,
    volume,
    setVolume,
    rate,
    setRate,
    loadError,
    audioSrc,
    segmentClipMode,
    setSegmentClipMode,
    preparing,
    viewEnd,
    lcdWindowT0,
    lcdWindowT1,
    skipSec,
    canControl,
    useSegmentClip,
    pausePlayback,
    seekTo,
    skipBy,
    stopPlayback,
    exitSegmentClip,
    startPlayback,
    togglePlay,
    playDetectionClip,
    onScrub,
    onPanelKeyDown,
    audioElement,
    playPauseLabel,
    playPauseHint,
    loopHint,
    hasTimeSelection,
    segmentRange,
    duration,
    playheadSec,
    channel,
  };
}
