import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LabelSegment } from "../api/labels";
import { labelBandLayout } from "../lib/labelBandLayout";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import {
  formatDetectionTypeLabel,
  styleForSegment,
  colorWithAlpha,
  type LabelColorMap,
  type LabelLayerSource,
} from "../lib/labelColors";
import { segmentTimeSec, type LabelTimeUnit } from "../lib/segmentTime";
import {
  detectionIntervalMatchesSelection,
  type DetectionSelection,
} from "../lib/spectrogramDetections";
import { scaleMarkOpacity } from "../lib/spectrogramMarkOpacity";
import { hitOverlaySegment } from "../lib/spectrogramOverlayHit";

export type OverlaySegment = LabelSegment & {
  source: LabelLayerSource;
  time_unit?: LabelTimeUnit;
};

type Props = {
  segments: OverlaySegment[];
  labelNames: string[];
  viewStart: number;
  viewSpan: number;
  durationSec: number;
  deltaT?: number | null;
  timeUnit?: LabelTimeUnit;
  colorMap: LabelColorMap;
  hiddenLabels: Set<string>;
  soloLabel: string | null;
  /** Row selected in the detections table — highlights one box, dims the rest. */
  selectedSegment?: DetectionSelection | null;
  /** Toolbar slider 0–100; 50 = default overlay strength. */
  markOpacity?: number;
  /** m04 «Вероятность» — show mean_p on overlay boxes. */
  showProbabilityLabels?: boolean;
  /**
   * Kept for API compatibility / tooltip Hz. Overlay Y uses class lanes
   * (MMS flat bands), not TF box geometry.
   */
  nyquistHz: number;
  /** Optional fixed layout (tests / Storybook). */
  layoutSize?: { w: number; h: number };
  onSegmentClick?: (seg: OverlaySegment) => void;
};

const MIN_WIDTH_PCT = 0.2;

/**
 * Spectrogram overlays: flat horizontal class bands (one Y level per class),
 * as in MMS-style annotation figures. Frequency is not shown on overlays
 * (orcAI labels are time intervals only).
 */
export function SpectrogramOverlay({
  segments,
  labelNames,
  viewStart,
  viewSpan,
  durationSec,
  deltaT,
  timeUnit,
  colorMap,
  hiddenLabels,
  soloLabel,
  selectedSegment = null,
  markOpacity = 50,
  showProbabilityLabels = false,
  nyquistHz,
  layoutSize,
  onSegmentClick,
}: Props) {
  const publicationNames = useClassPublicationNames();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(layoutSize ?? { w: 0, h: 0 });

  const measure = () => {
    const el = hostRef.current;
    if (!el) return;
    let width = el.clientWidth;
    let height = el.clientHeight;
    if (width <= 0 || height <= 0) {
      const parent = el.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        width = parent.clientWidth;
        height = parent.clientHeight;
      }
    }
    if (width > 0 && height > 0) {
      setSize({ w: width, h: height });
    }
  };

  useLayoutEffect(() => {
    if (layoutSize) {
      setSize(layoutSize);
      return;
    }
    measure();
  }, [layoutSize, segments.length, viewStart, viewSpan]);

  useEffect(() => {
    if (layoutSize) return;
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutSize]);

  const viewEnd = viewStart + viewSpan;
  const safeSpan = viewSpan > 0 ? viewSpan : 1;

  const visible = useMemo(() => {
    return segments.filter((seg) => {
      if (hiddenLabels.has(seg.label)) return false;
      if (soloLabel != null && seg.label !== soloLabel) return false;
      const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
      return t1 >= viewStart && t0 <= viewEnd;
    });
  }, [
    segments,
    hiddenLabels,
    soloLabel,
    deltaT,
    durationSec,
    timeUnit,
    viewStart,
    viewEnd,
  ]);

  // Silence unused-prop lint when callers still pass axis max for table sync.
  void nyquistHz;

  const pickFromPointer = (clientX: number, clientY: number): OverlaySegment | null => {
    const el = hostRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const layoutH = el.clientHeight > 0 ? el.clientHeight : size.h;
    if (!(layoutH > 0)) return null;
    const items = visible.map((seg) => {
      const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
      return { seg, label: seg.label, t0, t1 };
    });
    return hitOverlaySegment(items, {
      xFrac: (clientX - rect.left) / rect.width,
      yPx: ((clientY - rect.top) / rect.height) * layoutH,
      heightPx: layoutH,
      viewStart,
      viewSpan: safeSpan,
      labelNames,
      minWidthFrac: MIN_WIDTH_PCT / 100,
    });
  };

  return (
    <div
      ref={hostRef}
      className="analysis-spectrogram-overlay-layer h-full w-full overflow-hidden"
      aria-hidden={!onSegmentClick}
    >
      {size.h > 0 &&
        visible.map((seg, i) => {
          const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
          const leftPct =
            ((Math.max(t0, viewStart) - viewStart) / safeSpan) * 100;
          const widthPct =
            ((Math.min(t1, viewEnd) - Math.max(t0, viewStart)) / safeSpan) *
            100;

          const { y, bandHeight } = labelBandLayout(
            seg.label,
            labelNames,
            size.h,
          );
          const topPct = (y / size.h) * 100;
          const heightPct = (bandHeight / size.h) * 100;

          const dimmedBySolo = soloLabel != null && seg.label !== soloLabel;
          const isSelected = detectionIntervalMatchesSelection(
            t0,
            t1,
            selectedSegment,
            0.05,
            seg.label,
          );
          const softDimBySelection =
            selectedSegment != null && !isSelected;
          const style = styleForSegment(seg.label, seg.source, {
            solo: soloLabel === seg.label,
            dimmed: dimmedBySolo,
            highlighted: isSelected,
            colorMap,
          });
          const fillOpacity = scaleMarkOpacity(
            isSelected
              ? style.fillOpacity
              : softDimBySelection
                ? Math.min(0.45, Math.max(0.28, style.fillOpacity * 0.72))
                : dimmedBySolo
                  ? style.fillOpacity
                  : Math.min(0.72, style.fillOpacity + 0.18),
            markOpacity,
          );
          const fill = colorWithAlpha(style.fill, fillOpacity);
          const stroke = colorWithAlpha(
            style.stroke,
            Math.min(1, fillOpacity + 0.15),
          );

          const confPct =
            seg.mean_p != null ? `${(seg.mean_p * 100).toFixed(1)}%` : "—";
          const confLabel =
            seg.mean_p != null ? seg.mean_p.toFixed(2) : null;
          const tooltip = `${formatDetectionTypeLabel(seg.label, publicationNames)} (${confPct})`;

          return (
            <div
              key={`${seg.source}-${seg.label}-${seg.start}-${i}`}
              data-testid="spectrogram-overlay-box"
              data-detection-select=""
              data-fill-opacity={fillOpacity.toFixed(3)}
              data-layout="class-lane"
              title={tooltip}
              className={
                [
                  onSegmentClick
                    ? "analysis-overlay-box pointer-events-auto absolute box-border cursor-pointer"
                    : "analysis-overlay-box absolute box-border",
                  isSelected ? "analysis-overlay-box-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              data-selected={isSelected ? "true" : undefined}
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(MIN_WIDTH_PCT, widthPct)}%`,
                top: `${topPct}%`,
                height: `${heightPct}%`,
                zIndex: isSelected ? 3 : 1,
                boxSizing: "border-box",
                backgroundColor: fill,
                border: `${style.strokeWidth}px solid ${stroke}`,
                borderStyle: style.strokeDasharray ? "dashed" : "solid",
              }}
              onPointerDown={
                onSegmentClick
                  ? (e) => {
                      e.stopPropagation();
                    }
                  : undefined
              }
              onClick={
                onSegmentClick
                  ? (e) => {
                      e.stopPropagation();
                      const hit = pickFromPointer(e.clientX, e.clientY);
                      onSegmentClick(hit ?? seg);
                    }
                  : undefined
              }
            >
              {showProbabilityLabels && confLabel ? (
                <span className="analysis-overlay-prob" aria-hidden>
                  {confLabel}
                </span>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}
