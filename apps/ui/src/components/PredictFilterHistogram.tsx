import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  boundsFromBrush,
  durationFromPlotX,
  histogramCountTicks,
  HIST_OPEN_MAX_FRACTION,
  nextSnapAbove,
  previousSnapBelow,
  snapToStep,
  type DurationBound,
  type HistogramBin,
  type HistogramTail,
} from "../lib/callDurationLimits";

const MIN_BRUSH_PX = 5;

type Drag = {
  mode: "brush" | "min" | "max";
  pointerId: number;
  startX: number;
  originMin: DurationBound;
  originMax: DurationBound;
  plotLeft: number;
  plotWidth: number;
  span: number;
  binWidth: number;
};

type Props = {
  bins: HistogramBin[];
  tails: HistogramTail[];
  min: DurationBound;
  max: DurationBound;
  span: number;
  binWidth: number;
  color: string;
  disabled?: boolean;
  minLabel: (n: string) => string;
  maxLabel: (n: string) => string;
  axisLabel: string;
  countAxisLabel: string;
  formatSeconds: (n: number) => string;
  scaleLabel: (n: string) => string;
  tailRangeLabel: (from: string, to: string) => string;
  tailOpenLabel: (from: string) => string;
  binTip: (bin: HistogramBin) => string;
  legendKeep: string;
  legendDrop: string;
  hint: string;
  brushLabel: string;
  onChange: (min: DurationBound, max: DurationBound) => void;
  /** Axis stays put for the gesture. The parent pins `span` while this is true. */
  onGesture?: (active: boolean) => void;
};

function HistStack({
  count,
  keep,
  color,
  className,
  height,
}: {
  count: number;
  keep: number;
  color: string;
  className: string;
  height?: string;
}) {
  const drop = Math.max(0, count - keep);
  return (
    <div className={className} style={height ? { height } : undefined}>
      {keep > 0 ? (
        <span
          className="predict-filter-m05-hist-seg is-keep"
          style={{ flexGrow: keep, background: color }}
        />
      ) : null}
      {drop > 0 ? (
        <span
          className="predict-filter-m05-hist-seg is-drop"
          style={{ flexGrow: drop }}
        />
      ) : null}
    </div>
  );
}

function formatGate(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function gatePct(value: number, span: number): string {
  if (span <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (value / span) * 100))}%`;
}

/** Tick sits on the count it names. Peak is the top edge, zero is the bottom. */
function countTickBottom(tick: number, peak: number): string {
  if (peak <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (tick / peak) * 100))}%`;
}

export function PredictFilterHistogram({
  bins,
  tails,
  min,
  max,
  span,
  binWidth,
  color,
  disabled = false,
  minLabel,
  maxLabel,
  axisLabel,
  countAxisLabel,
  formatSeconds,
  scaleLabel,
  tailRangeLabel,
  tailOpenLabel,
  binTip,
  legendKeep,
  legendDrop,
  hint,
  brushLabel,
  onChange,
  onGesture,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const visibleTails = tails.filter((band) => band.count > 0);
  const peak = Math.max(0, ...bins.map((bin) => bin.count), ...tails.map((band) => band.count));
  const maxBin = Math.max(1, peak);
  const countTicks = histogramCountTicks(peak);
  const secondTicks = [0, 0.25, 0.5, 0.75, 1].map((part) => span * part);

  const commitFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, drag: Drag) => {
      const now = durationFromPlotX(
        e.clientX,
        drag.plotLeft,
        drag.plotWidth,
        drag.span,
      );
      if (drag.mode === "brush") {
        const start = durationFromPlotX(
          drag.startX,
          drag.plotLeft,
          drag.plotWidth,
          drag.span,
        );
        onChange(...boundsFromBrush(start, now, drag.span, drag.binWidth));
        return;
      }
      if (drag.mode === "min") {
        let next = snapToStep(now, drag.binWidth);
        if (drag.originMax != null && next >= drag.originMax) {
          next = previousSnapBelow(drag.originMax, drag.binWidth);
        }
        onChange(next, drag.originMax);
        return;
      }
      if (now >= drag.span * HIST_OPEN_MAX_FRACTION) {
        onChange(drag.originMin, null);
        return;
      }
      let next = snapToStep(now, drag.binWidth);
      if (drag.originMin != null && next <= drag.originMin) {
        next = nextSnapAbove(drag.originMin, drag.binWidth);
      }
      onChange(drag.originMin, next);
    },
    [onChange],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".predict-filter-m05-hist-tail")) return;
    if (!(e.target as HTMLElement).closest(".predict-filter-m05-hist-plot")) return;
    const handle = (e.target as HTMLElement).closest("[data-hist-handle]");
    const mode =
      (handle?.getAttribute("data-hist-handle") as Drag["mode"] | null) ??
      "brush";
    const rect = canvasRef.current?.getBoundingClientRect();
    dragRef.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      originMin: min,
      originMax: max,
      plotLeft: rect?.left ?? 0,
      plotWidth: rect?.width ?? 0,
      span,
      binWidth,
    };
    onGesture?.(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.mode === "brush" && Math.abs(e.clientX - drag.startX) < MIN_BRUSH_PX) {
      return;
    }
    commitFromPointer(e, drag);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag.mode !== "brush" || Math.abs(e.clientX - drag.startX) >= MIN_BRUSH_PX) {
      commitFromPointer(e, drag);
    }
    dragRef.current = null;
    onGesture?.(false);
  };

  const onDoubleClick = () => {
    if (disabled) return;
    onChange(null, null);
  };

  const showMin = min != null && min > 0 && min < span;
  const showMax = max != null && max > 0 && max <= span;
  const rangeLeft = min != null && min > 0 ? Math.min(min, span) : 0;
  const rangeRight = max != null ? Math.min(max, span) : span;
  const showRange = (showMin || showMax) && rangeRight > rangeLeft;

  return (
    <div className="predict-filter-m05-hist">
      <div
        className="predict-filter-m05-hist-body"
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div className="predict-filter-m05-hist-main">
          <div className="predict-filter-m05-hist-plot" aria-label={brushLabel}>
            <div className="predict-filter-m05-hist-plot-row">
              <div className="predict-filter-m05-hist-y" aria-label={countAxisLabel}>
                {countTicks.map((tick) => (
                  <span
                    key={tick}
                    className="predict-filter-m05-hist-y-tick"
                    style={{ bottom: countTickBottom(tick, peak) }}
                  >
                    {tick}
                  </span>
                ))}
              </div>
              <div className="predict-filter-m05-hist-canvas" ref={canvasRef}>
                <div className="predict-filter-m05-hist-bars">
                  {bins.map((bin, i) => (
                    <div key={i} className="predict-filter-m05-hist-slot" title={binTip(bin)}>
                      <HistStack
                        className="predict-filter-m05-hist-bar"
                        count={bin.count}
                        keep={bin.keep}
                        color={color}
                        height={bin.count ? `${(bin.count / maxBin) * 100}%` : "0%"}
                      />
                    </div>
                  ))}
                </div>
                {countTicks.map((tick) => (
                  <i
                    key={`hy-${tick}`}
                    className="predict-filter-m05-hist-guide is-h"
                    style={{ bottom: countTickBottom(tick, peak) }}
                    aria-hidden="true"
                  />
                ))}
                {secondTicks.map((tick) => (
                  <i
                    key={`vx-${tick}`}
                    className="predict-filter-m05-hist-guide is-v"
                    style={{ left: gatePct(tick, span) }}
                    aria-hidden="true"
                  />
                ))}
                {countTicks.map((tick) => (
                  <i
                    key={`y-${tick}`}
                    className="predict-filter-m05-hist-risk is-y"
                    style={{ bottom: countTickBottom(tick, peak) }}
                    aria-hidden="true"
                  />
                ))}
                {secondTicks.map((tick) => (
                  <i
                    key={`x-${tick}`}
                    className="predict-filter-m05-hist-risk is-x"
                    style={{ left: gatePct(tick, span) }}
                    aria-hidden="true"
                  />
                ))}
                {showRange ? (
                  <div
                    className="predict-filter-m05-hist-range"
                    style={{
                      left: gatePct(rangeLeft, span),
                      width: gatePct(rangeRight - rangeLeft, span),
                    }}
                  />
                ) : null}
                {showMin ? (
                  <div
                    className="predict-filter-m05-hist-gate is-min"
                    data-hist-handle="min"
                    style={{ left: gatePct(min, span) }}
                  />
                ) : null}
                {showMax ? (
                  <div
                    className="predict-filter-m05-hist-gate is-max"
                    data-hist-handle="max"
                    style={{ left: gatePct(max, span) }}
                  />
                ) : null}
                {showMin ? (
                  <span
                    className="predict-filter-m05-hist-mark is-min"
                    style={{ left: gatePct(min, span) }}
                  >
                    {minLabel(formatGate(min))}
                  </span>
                ) : null}
                {showMax ? (
                  <span
                    className="predict-filter-m05-hist-mark is-max"
                    style={{ left: gatePct(max, span) }}
                  >
                    {maxLabel(formatGate(max))}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="predict-filter-m05-hist-ticks">
              <span className="predict-filter-m05-hist-ticks-pad" aria-hidden="true" />
              <div className="predict-filter-m05-hist-ticks-scale">
                {secondTicks.map((tick, index) => (
                  <span
                    key={tick}
                    className={
                      index === 0
                        ? "is-start"
                        : index === secondTicks.length - 1
                          ? "is-end"
                          : "is-mid"
                    }
                    style={{ left: gatePct(tick, span) }}
                  >
                    {index === secondTicks.length - 1
                      ? scaleLabel(formatSeconds(tick))
                      : formatSeconds(tick)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {visibleTails.length > 0 ? (
          <div className="predict-filter-m05-hist-tails">
            {visibleTails.map((band) => (
              <div key={`${band.start}-${band.end ?? "open"}`} className="predict-filter-m05-hist-tail">
                <div className="predict-filter-m05-hist-tail-track">
                  <HistStack
                    className="predict-filter-m05-hist-tail-bar"
                    count={band.count}
                    keep={band.keep}
                    color={color}
                    height={`${(band.count / maxBin) * 100}%`}
                  />
                </div>
                <span className="predict-filter-m05-hist-tail-n">{band.count}</span>
                <span className="predict-filter-m05-hist-tail-label">
                  {band.end == null
                    ? tailOpenLabel(formatSeconds(band.start))
                    : tailRangeLabel(formatSeconds(band.start), formatSeconds(band.end))}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="predict-filter-m05-hist-axis">{axisLabel}</div>
      <div className="predict-filter-m05-hist-legend">
        <span className="predict-filter-m05-hist-key">
          <i className="predict-filter-m05-hist-swatch is-keep" style={{ background: color }} />
          {legendKeep}
        </span>
        <span className="predict-filter-m05-hist-key">
          <i className="predict-filter-m05-hist-swatch is-drop" />
          {legendDrop}
        </span>
      </div>
      <p className="predict-filter-m05-hist-hint">{hint}</p>
    </div>
  );
}
