import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  spectrogramSegmentWindow,
  type SpectrogramColormap,
} from "../lib/spectrogramView";
import {
  segmentRailSeekFromClientX,
  segmentRailViewport,
} from "./spectrogram/segmentRailHelpers";
import { SegmentRailStudioChrome } from "./spectrogram/SegmentRailStudioChrome";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";

type Props = {
  durationSec: number;
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
  onViewStartChange: (start: number) => void;
  onSegmentSelect: (index: number) => void;
  /** Results studio: compact rail above the spectrogram. */
  studioLayout?: boolean;
  /** m04: filename (primary). */
  fileName?: string | null;
  /** m04: muted meta after filename — `48 кГц · канал 1 · 23:12`. */
  fileMeta?: string | null;
  /** File-picker toggle — opens the dropdown under the track-name frame. */
  onFileMenuToggle?: (() => void) | null;
  onFileMenuClose?: (() => void) | null;
  fileMenuOpen?: boolean;
  fileMenuDisabled?: boolean;
  /** Names for the dropdown (colormap-style list, not a modal). */
  fileMenuFiles?: readonly { name: string }[] | null;
  fileMenuActiveName?: string | null;
  onFileMenuSelect?: ((name: string) => void) | null;
  /** Switch among recognized WAV files (sides of the track-name frame). */
  onFilePrev?: (() => void) | null;
  onFileNext?: (() => void) | null;
  canFilePrev?: boolean;
  canFileNext?: boolean;
  /** Table-hero mode: file/label nav only (hide spectrogram window segment controls). */
  fileNavOnly?: boolean;
  /**
   * Classes filter toggle.
   * Table-hero → modal; spectrogram studio → swap tools panel (transport ↔ classes).
   */
  onClassesFilterToggle?: (() => void) | null;
  classesFilterOpen?: boolean;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  /** Analysis plot palette. Shown on the right of the segment strip. */
  colormap?: SpectrogramColormap;
  onColormapChange?: ((map: SpectrogramColormap) => void) | null;
};

export function SpectrogramFileSegmentRail({
  durationSec,
  viewStart,
  viewSpan,
  segmentIndex,
  onViewStartChange,
  onSegmentSelect,
  studioLayout = false,
  fileName = null,
  fileMeta = null,
  onFileMenuToggle = null,
  onFileMenuClose = null,
  fileMenuOpen = false,
  fileMenuDisabled = false,
  fileMenuFiles = null,
  fileMenuActiveName = null,
  onFileMenuSelect = null,
  onFilePrev = null,
  onFileNext = null,
  canFilePrev = false,
  canFileNext = false,
  fileNavOnly = false,
  onClassesFilterToggle = null,
  classesFilterOpen = false,
  labelSource = null,
  colormap = "gray",
  onColormapChange = null,
}: Props) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const cmapRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [cmapOpen, setCmapOpen] = useState(false);

  useEffect(() => {
    if (!cmapOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (cmapRef.current?.contains(target)) return;
      setCmapOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [cmapOpen]);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (fileMenuRef.current?.contains(target)) return;
      onFileMenuClose?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFileMenuClose?.();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [fileMenuOpen, onFileMenuClose]);

  const {
    safeDuration,
    segmentTotal,
    maxStart,
    canScroll,
    canPrev,
    canNext,
    viewportLeftPct,
    viewportWidthPct,
  } = segmentRailViewport({ durationSec, viewStart, viewSpan, segmentIndex });

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const hit = segmentRailSeekFromClientX({
        clientX,
        trackEl: el,
        durationSec,
        studioLayout,
      });
      if (!hit) return;
      if (hit.kind === "segment") onSegmentSelect(hit.index);
      else onViewStartChange(hit.start);
    },
    [durationSec, onViewStartChange, onSegmentSelect, studioLayout],
  );

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    seekFromClientX(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    seekFromClientX(e.clientX);
  };

  const onTrackPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const segmentTrack = (
    <div
      ref={trackRef}
      className={
        studioLayout
          ? "analysis-segment-rail-studio-track"
          : "analysis-minimap-track"
      }
      role="slider"
      aria-label={t("spectrogram.segment.fileRailAria")}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, segmentTotal - 1)}
      aria-valuenow={segmentIndex}
      tabIndex={0}
      onPointerDown={onTrackPointerDown}
      onPointerMove={onTrackPointerMove}
      onPointerUp={onTrackPointerUp}
      onPointerCancel={onTrackPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onSegmentSelect(Math.max(0, segmentIndex - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onSegmentSelect(Math.min(segmentTotal - 1, segmentIndex + 1));
        }
      }}
    >
      {studioLayout
        ? Array.from({ length: segmentTotal }, (_, i) => {
            const active = i === segmentIndex;
            return (
              <button
                key={i}
                type="button"
                className={`analysis-segment-rail-studio-block${
                  active ? " is-active" : ""
                }`}
                title={t("spectrogram.segment.segmentBlockHint", {
                  index: i + 1,
                  t0: Math.round(
                    spectrogramSegmentWindow(i, durationSec).viewStart,
                  ),
                  t1: Math.round(
                    spectrogramSegmentWindow(i, durationSec).viewStart +
                      spectrogramSegmentWindow(i, durationSec).viewSpan,
                  ),
                })}
                aria-label={t("spectrogram.segment.segmentBlockAria", {
                  index: i + 1,
                  total: segmentTotal,
                })}
                aria-current={active ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSegmentSelect(i);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            );
          })
        : Array.from({ length: segmentTotal }, (_, i) => {
            const seg = spectrogramSegmentWindow(i, durationSec);
            const leftPct = (seg.viewStart / safeDuration) * 100;
            const widthPct = (seg.viewSpan / safeDuration) * 100;
            const active = i === segmentIndex;
            return (
              <button
                key={i}
                type="button"
                className={`analysis-minimap-segment ${active ? "analysis-minimap-segment-active" : ""}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(0.35, widthPct)}%`,
                }}
                title={t("spectrogram.segment.segmentBlockHint", {
                  index: i + 1,
                  t0: Math.round(seg.viewStart),
                  t1: Math.round(seg.viewStart + seg.viewSpan),
                })}
                aria-label={t("spectrogram.segment.segmentBlockAria", {
                  index: i + 1,
                  total: segmentTotal,
                })}
                aria-current={active ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSegmentSelect(i);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            );
          })}
      {!studioLayout ? (
        <div
          className="analysis-minimap-viewport"
          style={{
            left: `${viewportLeftPct}%`,
            width: `${Math.max(0.4, viewportWidthPct)}%`,
          }}
        />
      ) : null}
    </div>
  );

  if (studioLayout) {
    return (
      <SegmentRailStudioChrome
        t={t}
        durationSec={durationSec}
        viewStart={viewStart}
        viewSpan={viewSpan}
        segmentIndex={segmentIndex}
        segmentTotal={segmentTotal}
        canPrev={canPrev}
        canNext={canNext}
        fileName={fileName}
        fileMeta={fileMeta}
        onFileMenuToggle={onFileMenuToggle}
        onFileMenuClose={onFileMenuClose}
        fileMenuOpen={fileMenuOpen}
        fileMenuDisabled={fileMenuDisabled}
        fileMenuFiles={fileMenuFiles}
        fileMenuActiveName={fileMenuActiveName}
        onFileMenuSelect={onFileMenuSelect}
        onFilePrev={onFilePrev}
        onFileNext={onFileNext}
        canFilePrev={canFilePrev}
        canFileNext={canFileNext}
        fileNavOnly={fileNavOnly}
        onClassesFilterToggle={onClassesFilterToggle}
        classesFilterOpen={classesFilterOpen}
        labelSource={labelSource}
        colormap={colormap}
        onColormapChange={onColormapChange}
        cmapOpen={cmapOpen}
        setCmapOpen={setCmapOpen}
        cmapRef={cmapRef}
        fileMenuRef={fileMenuRef}
        onSegmentSelect={onSegmentSelect}
      />
    );
  }

  return (
    <div className="analysis-minimap">
      <p className="text-[10px] leading-snug text-foreground-muted">
        {t("spectrogram.segment.fileRailHint", {
          index: segmentIndex + 1,
          total: segmentTotal,
        })}
      </p>
      {segmentTrack}
      {canScroll ? (
        <input
          type="range"
          className="mt-2 h-2 w-full cursor-ew-resize accent-accent"
          min={0}
          max={maxStart}
          step={Math.max(0.01, viewSpan / 200)}
          value={viewStart}
          onChange={(e) => onViewStartChange(Number(e.target.value))}
          aria-label={t("spectrogram.scrollTimeline")}
        />
      ) : null}
    </div>
  );
}
