import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import type { LabelTimeUnit, LabelsPreview } from "../../api/labels";
import {
  resolvePlayheadSeek,
  viewStartForPlayhead,
} from "../../lib/spectrogramPlayer";
import { viewWindowForFocusedDetection } from "../../lib/spectrogramViewerLogic";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import type { DetectionFocusNav } from "../../lib/resultsStudio";
import { segmentTimeSec } from "../../lib/segmentTime";
import {
  pointerClearsTimeSelection,
  type TimeRangeSec,
} from "../../lib/spectrogramTimeRange";
import {
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
} from "../../lib/spectrogramView";
import {
  rememberSpectrogramView,
  resolveSpectrogramRememberedView,
  spectrogramViewStorageKey,
} from "../../lib/spectrogramViewMemory";
import type { OverlaySegment } from "../SpectrogramOverlay";

type Options = {
  wavPath: string;
  /** Active project id — scopes playhead memory so a new project starts at 0. */
  projectScope?: string | null;
  duration: number;
  showSpectrogram: boolean;
  studioChrome: boolean;
  focusNav?: DetectionFocusNav | null;
  primaryLabels: LabelsPreview | null;
  labelDeltaT: number | null | undefined;
  labelTimeUnit: LabelTimeUnit | undefined;
  viewStart: number;
  setViewStart: Dispatch<SetStateAction<number>>;
  viewSpan: number;
  setViewSpan: Dispatch<SetStateAction<number>>;
  segmentIndex: number;
  setSegmentIndex: Dispatch<SetStateAction<number>>;
  playheadSec: number;
  setPlayheadSec: Dispatch<SetStateAction<number>>;
  selectedSegment: DetectionSelection | null;
  setSelectedSegment: Dispatch<SetStateAction<DetectionSelection | null>>;
  setSegmentHint: Dispatch<SetStateAction<string | null>>;
  timeSelection: TimeRangeSec | null;
  setTimeSelection: Dispatch<SetStateAction<TimeRangeSec | null>>;
  timeSelectionDraft: TimeRangeSec | null;
  setTimeSelectionDraft: Dispatch<SetStateAction<TimeRangeSec | null>>;
  loopRegion: TimeRangeSec | null;
  setLoopRegion: Dispatch<SetStateAction<TimeRangeSec | null>>;
  setTileError: Dispatch<SetStateAction<string | null>>;
  setTileFetchWindow: Dispatch<SetStateAction<{ t0: number; t1: number }>>;
  timeDragRef: MutableRefObject<{ pointerId: number; anchorSec: number } | null>;
};

export function useSpectrogramFocusSelection({
  wavPath,
  projectScope = null,
  duration,
  showSpectrogram,
  studioChrome,
  focusNav,
  primaryLabels,
  labelDeltaT,
  labelTimeUnit,
  viewStart,
  setViewStart,
  viewSpan,
  setViewSpan,
  segmentIndex,
  setSegmentIndex,
  playheadSec,
  setPlayheadSec,
  selectedSegment,
  setSelectedSegment,
  setSegmentHint,
  timeSelection,
  setTimeSelection,
  timeSelectionDraft,
  setTimeSelectionDraft,
  loopRegion,
  setLoopRegion,
  setTileError,
  setTileFetchWindow,
  timeDragRef,
}: Options) {
  const { t } = useTranslation();
  const appliedViewKeyRef = useRef<string | null>(null);
  const skipViewSaveRef = useRef(true);
  const playheadSaveRef = useRef(0);

  useEffect(() => {
    if (!wavPath || duration <= 0) return;
    const viewKey = spectrogramViewStorageKey(projectScope, wavPath);
    if (appliedViewKeyRef.current === viewKey) return;
    appliedViewKeyRef.current = viewKey;
    skipViewSaveRef.current = true;
    const next = resolveSpectrogramRememberedView(
      wavPath,
      duration,
      projectScope,
    );
    setSegmentIndex(next.segmentIndex);
    setViewStart(next.viewStart);
    setViewSpan(next.viewSpan);
    setPlayheadSec(next.playheadSec);
    setSelectedSegment(next.selected);
    setTimeSelectionDraft(null);
    setTimeSelection(null);
    setLoopRegion(null);
    setTileError(null);
  }, [
    wavPath,
    projectScope,
    duration,
    setSegmentIndex,
    setViewStart,
    setViewSpan,
    setPlayheadSec,
    setSelectedSegment,
    setTimeSelectionDraft,
    setTimeSelection,
    setLoopRegion,
    setTileError,
  ]);

  playheadSaveRef.current = playheadSec;

  useEffect(() => {
    if (!wavPath || duration <= 0) return;
    if (skipViewSaveRef.current) {
      skipViewSaveRef.current = false;
      return;
    }
    rememberSpectrogramView(
      wavPath,
      {
        viewStart,
        viewSpan,
        playheadSec: playheadSaveRef.current,
        selected: selectedSegment,
      },
      projectScope,
    );
  }, [wavPath, projectScope, duration, viewStart, viewSpan, selectedSegment]);

  useEffect(() => {
    if (!selectedSegment) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-detection-select]")) return;
      if (target.closest("[data-detection-columns]")) return;
      if (target.closest("[data-detection-legend]")) return;
      if (target.closest("[data-detection-scope]")) return;
      // Keep selection while using transport / tools / segment rail / modals.
      if (target.closest("[data-spectrogram-chrome]")) return;
      if (target.closest("[data-spectrogram-zoom]")) return;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest(".predict-app-modal-overlay")) return;
      setSelectedSegment(null);
      setSegmentHint(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedSegment, setSelectedSegment, setSegmentHint]);

  /** Clear LMB time selection / loop when clicking outside plot + transport chrome. */
  useEffect(() => {
    if (
      timeSelection == null &&
      timeSelectionDraft == null &&
      loopRegion == null
    ) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (timeDragRef.current) return;
      if (!pointerClearsTimeSelection(e.target)) return;
      setTimeSelection(null);
      setTimeSelectionDraft(null);
      setLoopRegion(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [
    timeSelection,
    timeSelectionDraft,
    loopRegion,
    timeDragRef,
    setTimeSelection,
    setTimeSelectionDraft,
    setLoopRegion,
  ]);

  const focusDetection = useCallback(
    (t0: number, t1: number, label?: string) => {
      // Select first so a layout shift / focus scroll cannot drop the highlight.
      setSelectedSegment({
        t0,
        t1: Math.max(t0, t1),
        ...(label != null && label !== "" ? { label } : {}),
      });

      // Table-hero: no plot/audio — skip segment/tile/playhead churn.
      if (!showSpectrogram) return;

      const next = viewWindowForFocusedDetection(
        t0,
        t1,
        viewStart,
        viewSpan,
        segmentIndex,
        duration,
      );
      if (next.reset) {
        setSegmentIndex(next.segmentIndex);
        setViewStart(next.viewStart);
        setViewSpan(next.viewSpan);
        // Prefer tile window refresh over full cache invalidate for snappier jumps.
        const tile = spectrogramTileOverscanWindow(
          next.viewStart,
          next.viewStart + next.viewSpan,
          duration,
        );
        setTileFetchWindow(tile);
      }

      // Seek playhead using the post-focus window — do not call seekToTime with
      // a stale viewStart (it used to overwrite the segment reset above).
      const { playhead, atStart, atEnd } = resolvePlayheadSeek(t0, duration);
      setPlayheadSec(playhead);
      const panStart = viewStartForPlayhead(
        playhead,
        next.viewStart,
        next.viewSpan,
        duration,
        atStart,
        atEnd,
      );
      const seg = spectrogramSegmentWindow(next.segmentIndex, duration);
      const maxStart = Math.max(
        seg.viewStart,
        seg.viewStart + seg.viewSpan - next.viewSpan,
      );
      const clamped = Math.max(seg.viewStart, Math.min(panStart, maxStart));
      if (Math.abs(clamped - next.viewStart) > 1e-6) {
        setViewStart(clamped);
      }
    },
    [
      duration,
      viewStart,
      viewSpan,
      segmentIndex,
      showSpectrogram,
      setSelectedSegment,
      setSegmentIndex,
      setViewStart,
      setViewSpan,
      setTileFetchWindow,
      setPlayheadSec,
    ],
  );

  const focusDetectionRef = useRef(focusDetection);
  focusDetectionRef.current = focusDetection;
  useEffect(() => {
    if (!focusNav || !primaryLabels) return;
    // Do not depend on `focusDetection`: its identity includes viewStart /
    // segmentIndex, so a segment-chevron click would snap back to the row.
    focusDetectionRef.current(focusNav.t0, focusNav.t1, focusNav.label);
  }, [focusNav, primaryLabels]);

  const onSegmentClick = useCallback(
    (seg: OverlaySegment) => {
      const { t0, t1 } = segmentTimeSec(seg, labelDeltaT, duration, labelTimeUnit);
      focusDetection(t0, t1, seg.label);
      // Studio already highlights overlay + detections table; a free-floating
      // hint between the segment rail and plot created a visible seam artifact.
      if (studioChrome) {
        setSegmentHint(null);
        return;
      }
      const sourceLabel =
        seg.source === "compare"
          ? t("spectrogram.legendCompare")
          : t("spectrogram.legendPrimary");
      setSegmentHint(
        t("spectrogram.segmentHint", {
          label: seg.label,
          start: t0.toFixed(2),
          end: t1.toFixed(2),
          source: sourceLabel,
        }),
      );
    },
    [
      focusDetection,
      t,
      labelDeltaT,
      duration,
      labelTimeUnit,
      studioChrome,
      setSegmentHint,
    ],
  );

  return { focusDetection, onSegmentClick };
}
