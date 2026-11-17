import {
  useCallback,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  resolvePlayheadSeek,
  viewStartForPlayhead,
} from "../../lib/spectrogramPlayer";
import { resolveSpectrogramPanFree } from "../../lib/spectrogramViewerLogic";
import {
  clampTimeRange,
  MIN_TIME_RANGE_SEC,
  type TimeRangeSec,
} from "../../lib/spectrogramTimeRange";
import { spectrogramSegmentIndexForStart } from "../../lib/spectrogramView";

type Args = {
  duration: number;
  viewStart: number;
  setViewStart: Dispatch<SetStateAction<number>>;
  viewSpan: number;
  setSegmentIndex: Dispatch<SetStateAction<number>>;
  setPlayheadSec: Dispatch<SetStateAction<number>>;
  flushTileFetch: () => void;
  handPanArmed: boolean;
  onHandDragActiveChange?: (active: boolean) => void;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  visibleSpan: number;
  timeSelection: TimeRangeSec | null;
  setTimeSelection: Dispatch<SetStateAction<TimeRangeSec | null>>;
  setTimeSelectionDraft: Dispatch<SetStateAction<TimeRangeSec | null>>;
  loopRegion: TimeRangeSec | null;
  setLoopRegion: Dispatch<SetStateAction<TimeRangeSec | null>>;
};

export function useSpectrogramLoopSegment({
  duration,
  viewStart,
  setViewStart,
  viewSpan,
  setSegmentIndex,
  setPlayheadSec,
  flushTileFetch,
  handPanArmed,
  onHandDragActiveChange,
  seekAreaRef,
  visibleSpan,
  timeSelection,
  setTimeSelection,
  setTimeSelectionDraft,
  loopRegion,
  setLoopRegion,
}: Args) {
  const timeDragRef = useRef<{ pointerId: number; anchorSec: number } | null>(
    null,
  );
  const handDragRef = useRef<{
    pointerId: number;
    originX: number;
    originViewStart: number;
  } | null>(null);
  const suppressSeekClickRef = useRef(false);

  const seekToTime = useCallback(
    (sec: number) => {
      const { playhead, atStart, atEnd } = resolvePlayheadSeek(sec, duration);
      setPlayheadSec(playhead);

      const nextStart = viewStartForPlayhead(
        playhead,
        viewStart,
        viewSpan,
        duration,
        atStart,
        atEnd,
      );
      if (Math.abs(nextStart - viewStart) > 1e-6) {
        setViewStart(nextStart);
        setSegmentIndex(spectrogramSegmentIndexForStart(nextStart, duration));
      }
    },
    [
      duration,
      viewSpan,
      viewStart,
      setPlayheadSec,
      setViewStart,
      setSegmentIndex,
    ],
  );

  const coordsFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = seekAreaRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const xFrac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const yFrac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return {
        timeSec: viewStart + xFrac * visibleSpan,
        yFrac,
      };
    },
    [viewStart, visibleSpan, seekAreaRef],
  );

  const timeSecFromClientX = useCallback(
    (clientX: number) => coordsFromClient(clientX, 0)?.timeSec ?? null,
    [coordsFromClient],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const sec = timeSecFromClientX(clientX);
      if (sec != null) seekToTime(sec);
    },
    [timeSecFromClientX, seekToTime],
  );

  const clearLoop = useCallback(() => {
    setLoopRegion(null);
    setTimeSelection(null);
    setTimeSelectionDraft(null);
  }, [setLoopRegion, setTimeSelection, setTimeSelectionDraft]);

  const handleLoopRegionToggle = useCallback(() => {
    if (loopRegion != null) {
      setLoopRegion(null);
      return;
    }
    if (timeSelection == null) return;
    setLoopRegion(timeSelection);
    seekToTime(timeSelection.t0);
  }, [loopRegion, seekToTime, timeSelection, setLoopRegion]);

  const onSeekPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Detection boxes handle their own click → table highlight; don't steal the pointer.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-detection-select]")
      ) {
        return;
      }

      if (handPanArmed) {
        handDragRef.current = {
          pointerId: e.pointerId,
          originX: e.clientX,
          originViewStart: viewStart,
        };
        onHandDragActiveChange?.(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const sec = timeSecFromClientX(e.clientX);
      if (sec == null) return;
      timeDragRef.current = { pointerId: e.pointerId, anchorSec: sec };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [handPanArmed, onHandDragActiveChange, timeSecFromClientX, viewStart],
  );

  const onSeekPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const hand = handDragRef.current;
      if (hand && hand.pointerId === e.pointerId) {
        const el = seekAreaRef.current;
        if (!el) return;
        const width = Math.max(1, el.getBoundingClientRect().width);
        const deltaSec = ((hand.originX - e.clientX) / width) * visibleSpan;
        const next = resolveSpectrogramPanFree({
          viewStart: hand.originViewStart,
          viewSpan,
          durationSec: duration,
          deltaSec,
        });
        if (Math.abs(next.viewStart - viewStart) > 1e-6) {
          setViewStart(next.viewStart);
          setSegmentIndex(next.segmentIndex);
        }
        return;
      }

      const drag = timeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const sec = timeSecFromClientX(e.clientX);
      if (sec == null) return;
      // Ignore tiny jitter until the range is wide enough to count as a selection.
      if (Math.abs(sec - drag.anchorSec) < MIN_TIME_RANGE_SEC) return;
      setTimeSelectionDraft({ t0: drag.anchorSec, t1: sec });
    },
    [
      duration,
      timeSecFromClientX,
      viewSpan,
      viewStart,
      visibleSpan,
      seekAreaRef,
      setViewStart,
      setSegmentIndex,
      setTimeSelectionDraft,
    ],
  );

  const onSeekPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const hand = handDragRef.current;
      if (hand && hand.pointerId === e.pointerId) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        const moved = Math.abs(e.clientX - hand.originX) > 3;
        handDragRef.current = null;
        onHandDragActiveChange?.(false);
        if (moved) {
          suppressSeekClickRef.current = true;
          // Single STFT after the gesture — not on every pointermove.
          flushTileFetch();
        }
        return;
      }

      const drag = timeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const sec = timeSecFromClientX(e.clientX);
      const anchor = drag.anchorSec;
      timeDragRef.current = null;
      if (sec == null) {
        setTimeSelectionDraft(null);
        return;
      }

      const fixed = clampTimeRange(anchor, sec, duration);
      if (fixed) {
        setTimeSelection(fixed);
        setTimeSelectionDraft(null);
        // New range invalidates an active loop until Loop is pressed again.
        setLoopRegion(null);
        seekToTime(fixed.t0);
        suppressSeekClickRef.current = true;
        return;
      }

      // Click / tiny drag → seek, keep prior selection.
      setTimeSelectionDraft(null);
      seekToTime(sec);
      suppressSeekClickRef.current = true;
    },
    [
      duration,
      flushTileFetch,
      onHandDragActiveChange,
      seekToTime,
      timeSecFromClientX,
      setTimeSelection,
      setTimeSelectionDraft,
      setLoopRegion,
    ],
  );

  const onSeekClick = useCallback(
    (e: { clientX: number }) => {
      if (suppressSeekClickRef.current) {
        suppressSeekClickRef.current = false;
        return;
      }
      if (handPanArmed) return;
      seekFromClientX(e.clientX);
    },
    [handPanArmed, seekFromClientX],
  );

  return {
    seekToTime,
    coordsFromClient,
    clearLoop,
    handleLoopRegionToggle,
    onSeekPointerDown,
    onSeekPointerMove,
    onSeekPointerUp,
    onSeekClick,
    timeDragRef,
  };
}
