import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  boundsFromBrush,
  durationFromPlotX,
  HIST_OPEN_MAX_FRACTION,
  snapDuration,
  type DurationBound,
  type HistogramBin,
} from "../lib/callDurationLimits";

const MIN_BRUSH_PX = 5;

type Drag = {
  mode: "brush" | "min" | "max";
  pointerId: number;
  startX: number;
  originMin: DurationBound;
  originMax: DurationBound;
};

type Props = {
  bins: HistogramBin[];
  min: DurationBound;
  max: DurationBound;
  span: number;
  color: string;
  disabled?: boolean;
  minLabel: (n: string) => string;
  maxLabel: (n: string) => string;
  axisLabel: string;
  hint: string;
  brushLabel: string;
  onChange: (min: DurationBound, max: DurationBound) => void;
};

function formatGate(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function gatePct(value: number, span: number): string {
  if (span <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (value / span) * 100))}%`;
}

export function PredictFilterHistogram({
  bins,
  min,
  max,
  span,
  color,
  disabled = false,
  minLabel,
  maxLabel,
  axisLabel,
  hint,
  brushLabel,
  onChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const maxBin = Math.max(1, ...bins.map((b) => b.count));

  const readX = useCallback(
    (clientX: number) => {
      const el = canvasRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return durationFromPlotX(clientX, rect.left, rect.width, span);
    },
    [span],
  );

  const commitFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, drag: Drag) => {
      const now = readX(e.clientX);
      if (drag.mode === "brush") {
        onChange(...boundsFromBrush(readX(drag.startX), now, span));
        return;
      }
      if (drag.mode === "min") {
        let next = snapDuration(now);
        if (drag.originMax != null && next >= drag.originMax) {
          next = snapDuration(Math.max(0, drag.originMax - 0.01));
        }
        onChange(next, drag.originMax);
        return;
      }
      if (now >= span * HIST_OPEN_MAX_FRACTION) {
        onChange(drag.originMin, null);
        return;
      }
      let next = snapDuration(now);
      if (drag.originMin != null && next <= drag.originMin) {
        next = snapDuration(drag.originMin + 0.01);
      }
      onChange(drag.originMin, next);
    },
    [onChange, readX, span],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest("[data-hist-handle]");
    const mode =
      (handle?.getAttribute("data-hist-handle") as Drag["mode"] | null) ??
      "brush";
    dragRef.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      originMin: min,
      originMax: max,
    };
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
  };

  const onDoubleClick = () => {
    if (disabled) return;
    onChange(null, null);
  };

  const showMin = min != null && min > 0;
  const showMax = max != null;
  const rangeLeft = min != null && min > 0 ? min : 0;
  const rangeRight = max != null ? max : span;
  const showRange = showMin || showMax;

  return (
    <div className="predict-filter-m05-hist">
      <div
        className="predict-filter-m05-hist-plot"
        aria-label={brushLabel}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div className="predict-filter-m05-hist-canvas" ref={canvasRef}>
          <div className="predict-filter-m05-hist-bars">
            {bins.map((bin, i) => {
              const dropped =
                (min != null && bin.end < min) ||
                (max != null && bin.start > max);
              return (
                <div
                  key={i}
                  className={
                    dropped
                      ? "predict-filter-m05-hist-bar is-drop"
                      : "predict-filter-m05-hist-bar"
                  }
                  style={{
                    height: bin.count
                      ? `${Math.max(6, (bin.count / maxBin) * 100)}%`
                      : "0%",
                    background: dropped ? undefined : color,
                  }}
                />
              );
            })}
          </div>
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
      <div className="predict-filter-m05-hist-axis">{axisLabel}</div>
      <p className="predict-filter-m05-hist-hint">{hint}</p>
    </div>
  );
}
