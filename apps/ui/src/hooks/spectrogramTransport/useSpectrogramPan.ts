import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  resolveSpectrogramPan,
  resolveSpectrogramPanFree,
  snapMinimapToSegment,
} from "../../lib/spectrogramViewerLogic";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";
import { spectrogramSegmentIndexForStart } from "../../lib/spectrogramView";

type Args = {
  duration: number;
  viewStart: number;
  setViewStart: Dispatch<SetStateAction<number>>;
  viewSpan: number;
  segmentIndex: number;
  setSegmentIndex: Dispatch<SetStateAction<number>>;
  handPanArmed: boolean;
  setHandPanArmed: Dispatch<SetStateAction<boolean>>;
  setTimeSelectionDraft: Dispatch<SetStateAction<TimeRangeSec | null>>;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  visibleSpan: number;
  applySegment: (index: number) => void;
};

export function useSpectrogramPan({
  duration,
  viewStart,
  setViewStart,
  viewSpan,
  segmentIndex,
  setSegmentIndex,
  handPanArmed,
  setHandPanArmed,
  setTimeSelectionDraft,
  seekAreaRef,
  visibleSpan,
  applySegment,
}: Args) {
  const pan = useCallback(
    (deltaSec: number) => {
      if (handPanArmed) {
        const next = resolveSpectrogramPanFree({
          viewStart,
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
      const result = resolveSpectrogramPan({
        viewStart,
        viewSpan,
        segmentIndex,
        durationSec: duration,
        deltaSec,
      });
      if (result.kind === "segment") {
        applySegment(result.segmentIndex);
        return;
      }
      if (Math.abs(result.viewStart - viewStart) > 1e-6) {
        setViewStart(result.viewStart);
      }
    },
    [
      viewStart,
      viewSpan,
      segmentIndex,
      duration,
      applySegment,
      handPanArmed,
      setViewStart,
      setSegmentIndex,
    ],
  );

  const toggleHandPan = useCallback(() => {
    setHandPanArmed((armed) => {
      const next = !armed;
      if (next) {
        setTimeSelectionDraft(null);
      }
      return next;
    });
  }, [setHandPanArmed, setTimeSelectionDraft]);

  const setViewStartClamped = useCallback(
    (start: number) => {
      const snapped = snapMinimapToSegment(start, duration);
      const next = Math.max(0, Math.min(snapped, duration - viewSpan));
      setViewStart(next);
      setSegmentIndex(spectrogramSegmentIndexForStart(next, duration));
    },
    [duration, viewSpan, setViewStart, setSegmentIndex],
  );

  const canScrollTime = viewSpan < duration - 0.01;

  useEffect(() => {
    const el = seekAreaRef.current;
    if (!el || !canScrollTime) return;

    const onWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const secPerPx = visibleSpan / Math.max(1, rect.width);
      pan(delta * secPerPx);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canScrollTime, pan, visibleSpan, seekAreaRef]);

  return {
    pan,
    toggleHandPan,
    setViewStartClamped,
    canScrollTime,
  };
}
