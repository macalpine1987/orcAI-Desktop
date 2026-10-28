import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { formatSpectrogramAxisTime } from "../lib/spectrogramTimeTicks";
import {
  spectrogramSegmentCount,
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
} from "../lib/spectrogramView";
import {
  IconAudioFiles,
  IconChevronLeft,
  IconChevronRight,
  IconLayers,
  IconWaveform,
} from "./SpectrogramIcons";
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
  /** File-picker toggle — replaces the old chevron on the left. */
  onFileMenuToggle?: (() => void) | null;
  fileMenuOpen?: boolean;
  fileMenuDisabled?: boolean;
  /** Switch among recognized WAV files (before the file-list button). */
  onFilePrev?: (() => void) | null;
  onFileNext?: (() => void) | null;
  canFilePrev?: boolean;
  canFileNext?: boolean;
  /** Table-hero mode: file/label nav only (hide spectrogram window segment controls). */
  fileNavOnly?: boolean;
  /** Table-hero: open classes filter modal (same controls as the sidebar). */
  onClassesFilterToggle?: (() => void) | null;
  classesFilterOpen?: boolean;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
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
  fileMenuOpen = false,
  fileMenuDisabled = false,
  onFilePrev = null,
  onFileNext = null,
  canFilePrev = false,
  canFileNext = false,
  fileNavOnly = false,
  onClassesFilterToggle = null,
  classesFilterOpen = false,
  labelSource = null,
}: Props) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);

  const safeDuration = Math.max(durationSec, 0.01);
  const segmentTotal = spectrogramSegmentCount(safeDuration);
  const maxStart = Math.max(0, durationSec - viewSpan);
  const canScroll = durationSec > 0 && viewSpan < durationSec - 0.01;
  const canPrev = segmentIndex > 0;
  const canNext = segmentIndex < segmentTotal - 1;

  const viewportLeftPct = (viewStart / safeDuration) * 100;
  const viewportWidthPct = (viewSpan / safeDuration) * 100;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || durationSec <= 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (studioLayout) {
        const sec = frac * durationSec;
        onSegmentSelect(spectrogramSegmentIndexForStart(sec, durationSec));
        return;
      }
      onViewStartChange(frac * durationSec);
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
    if (durationSec <= 0) return null;

    const t0Label = formatSpectrogramAxisTime(viewStart);
    const t1Label = formatSpectrogramAxisTime(
      Math.min(durationSec, viewStart + viewSpan),
    );
    const segmentRangeLabel = `${t0Label} — ${t1Label}`;
    const segmentDurationLabel = t("spectrogram.segment.fileDuration", {
      sec: Math.max(1, Math.round(viewSpan)),
    });

    return (
      <div
        className={`analysis-segment-rail-studio${
          fileNavOnly ? " is-file-nav-only" : ""
        }`}
        role="group"
        aria-label={t("spectrogram.segment.studioSliderAria")}
        data-spectrogram-chrome=""
        data-file-nav-only={fileNavOnly ? "" : undefined}
      >
        <div className="analysis-segment-rail-studio-head">
          <div className="analysis-segment-rail-studio-file">
            <span className="analysis-segment-rail-studio-wave" aria-hidden>
              <IconWaveform />
            </span>
            {fileName ? (
              <span
                className="analysis-segment-rail-studio-filename"
                title={fileName}
              >
                {fileName}
              </span>
            ) : null}
            {labelSource ? (
              <div
                className="analysis-segment-rail-studio-labels"
                role="group"
                aria-label={t("predict.results.labelSourceAria")}
              >
                <button
                  type="button"
                  className="analysis-segment-rail-studio-label-btn"
                  aria-pressed={labelSource.kind === "original"}
                  disabled={!labelSource.originalAvailable}
                  title={t("predict.results.labelSourceOriginalHint")}
                  onClick={() => labelSource.onChange("original")}
                >
                  {t("predict.results.labelSourceOriginal")}
                </button>
                <button
                  type="button"
                  className="analysis-segment-rail-studio-label-btn"
                  aria-pressed={labelSource.kind === "filtered"}
                  disabled={!labelSource.filteredAvailable}
                  title={
                    labelSource.fileName && labelSource.kind === "filtered"
                      ? labelSource.fileName
                      : t("predict.results.labelSourceFilteredHint")
                  }
                  onClick={() => labelSource.onChange("filtered")}
                >
                  {t("predict.results.labelSourceFiltered")}
                </button>
              </div>
            ) : null}
            <div className="analysis-segment-rail-studio-file-end">
              {onFilePrev || onFileNext ? (
                <div
                  className="analysis-segment-rail-studio-filenav"
                  role="group"
                  aria-label={t("predict.results.fileNavAria")}
                >
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-filenav-btn"
                    disabled={!canFilePrev || fileMenuDisabled}
                    aria-label={t("predict.results.filePrev")}
                    title={t("predict.results.filePrevHint")}
                    onClick={() => onFilePrev?.()}
                  >
                    <IconChevronLeft />
                  </button>
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-filenav-btn"
                    disabled={!canFileNext || fileMenuDisabled}
                    aria-label={t("predict.results.fileNext")}
                    title={t("predict.results.fileNextHint")}
                    onClick={() => onFileNext?.()}
                  >
                    <IconChevronRight />
                  </button>
                </div>
              ) : null}
              {onFileMenuToggle ? (
                <button
                  type="button"
                  className={`analysis-segment-rail-studio-filemenu${
                    fileMenuOpen ? " is-open" : ""
                  }`}
                  disabled={fileMenuDisabled}
                  aria-label={t("predict.results.filePicker")}
                  title={
                    fileMenuOpen
                      ? t("predict.results.filePickerCloseHint")
                      : t("predict.results.filePickerHint")
                  }
                  aria-expanded={fileMenuOpen}
                  onClick={onFileMenuToggle}
                >
                  <IconAudioFiles size={18} />
                </button>
              ) : null}
              {fileNavOnly && onClassesFilterToggle ? (
                <button
                  type="button"
                  className={`analysis-segment-rail-studio-classes${
                    classesFilterOpen ? " is-open" : ""
                  }`}
                  aria-label={t("predict.results.classesFilter")}
                  title={
                    classesFilterOpen
                      ? t("predict.results.classesFilterCloseHint")
                      : t("predict.results.classesFilterHint")
                  }
                  aria-expanded={classesFilterOpen}
                  onClick={onClassesFilterToggle}
                >
                  <IconLayers />
                </button>
              ) : null}
              {fileMeta ? (
                <span className="analysis-segment-rail-studio-filemeta-muted">
                  {fileMeta}
                </span>
              ) : null}
            </div>
          </div>

          {!fileNavOnly ? (
            <>
              <div className="analysis-segment-rail-studio-sep" aria-hidden />

              <div className="analysis-segment-rail-studio-right">
                <div className="analysis-segment-rail-studio-meta">
                  <span className="analysis-segment-rail-studio-title">
                    {t("spectrogram.segment.counter", {
                      index: segmentIndex + 1,
                      total: segmentTotal,
                    })}
                  </span>
                  <span className="analysis-segment-rail-studio-range">
                    {segmentRangeLabel}
                  </span>
                  <span className="analysis-segment-rail-studio-duration">
                    · {segmentDurationLabel}
                  </span>
                </div>

                <div className="analysis-segment-rail-studio-nav">
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-nav-btn"
                    disabled={!canPrev}
                    aria-label={t("spectrogram.segment.navPrev")}
                    title={t("spectrogram.segment.navPrev")}
                    onClick={() => onSegmentSelect(segmentIndex - 1)}
                  >
                    <IconChevronLeft />
                  </button>
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-nav-btn"
                    disabled={!canNext}
                    aria-label={t("spectrogram.segment.navNext")}
                    title={t("spectrogram.segment.navNext")}
                    onClick={() => onSegmentSelect(segmentIndex + 1)}
                  >
                    <IconChevronRight />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
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
