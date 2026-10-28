import type { LabelSegment } from "../api/labels";
import {
  colorForLabel,
  orderedLabelsFromSegments,
  styleForSegment,
  type LabelColorMap,
  type LabelLayerSource,
} from "../lib/labelColors";
import { laneBarLayout } from "../lib/spectrogramLaneLayout";
import { segmentTimeSec, type LabelTimeUnit } from "../lib/segmentTime";

export type LaneSegment = LabelSegment & { source?: LabelLayerSource };

type Props = {
  segments: LaneSegment[];
  viewStart: number;
  viewSpan: number;
  width: number;
  height?: number;
  durationSec: number;
  deltaT?: number | null;
  timeUnit?: LabelTimeUnit;
  colorMap: LabelColorMap;
  hiddenLabels?: Set<string>;
  soloLabel?: string | null;
  nyquistHz?: number;
};

const MIN_LANE_PX = 6;

export function AnnotationLanes({
  segments,
  viewStart,
  viewSpan,
  width,
  height = 48,
  durationSec,
  deltaT,
  timeUnit,
  colorMap,
  hiddenLabels,
  soloLabel,
  nyquistHz = 0,
}: Props) {
  const viewEnd = viewStart + viewSpan;
  const safeSpan = viewSpan > 0 ? viewSpan : 1;

  const labelOrder = orderedLabelsFromSegments(
    segments.map((s) => ({ label: s.label })),
  );
  const rowIndex = new Map(labelOrder.map((label, i) => [label, i]));
  const bandHeight = Math.max(
    MIN_LANE_PX,
    (height - 8) / Math.max(1, labelOrder.length),
  );

  const visible = segments.filter((seg) => {
    if (hiddenLabels?.has(seg.label)) return false;
    if (soloLabel != null && seg.label !== soloLabel) return false;
    const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
    return t1 >= viewStart && t0 <= viewEnd;
  });

  return (
    <svg
      width={width}
      height={height}
      className="block w-full border-t border-white/10 bg-transparent"
      aria-hidden
    >
      {visible.map((seg, i) => {
        const { t0, t1 } = segmentTimeSec(seg, deltaT, durationSec, timeUnit);
        const x = ((Math.max(t0, viewStart) - viewStart) / safeSpan) * width;
        const xEnd = ((Math.min(t1, viewEnd) - viewStart) / safeSpan) * width;
        const w = Math.max(1, xEnd - x);
        const source = seg.source ?? "primary";
        const style = styleForSegment(seg.label, source, {
          solo: soloLabel === seg.label,
          colorMap,
        });
        const color = colorForLabel(seg.label, colorMap);
        const row = rowIndex.get(seg.label) ?? 0;
        const laneInner = bandHeight - 2;
        // Flat class lanes (MMS-style); Hz stays in the detections table / tooltips.
        void nyquistHz;
        const bar = laneBarLayout(
          undefined,
          undefined,
          laneInner,
          "linear",
          0,
        );
        const y = 4 + row * bandHeight + bar.yOffset;

        return (
          <g key={`${source}-${seg.label}-${seg.start}-${i}`}>
            <rect
              x={x}
              y={y}
              width={w}
              height={bar.height}
              fill={color}
              fillOpacity={style.fillOpacity}
              stroke="none"
            />
            <line
              x1={x}
              y1={y}
              x2={x + w}
              y2={y}
              stroke={color}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.strokeDasharray}
            />
            <line
              x1={x}
              y1={y + bar.height}
              x2={x + w}
              y2={y + bar.height}
              stroke={color}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.strokeDasharray}
            />
          </g>
        );
      })}
    </svg>
  );
}
