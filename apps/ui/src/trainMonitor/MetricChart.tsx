import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { chartYDomain, formatTick } from "../lib/chartScale";

const TRAIN_STROKE = "#9aa0a6";
const VAL_STROKE = "#7dffa3";
const GRID_STROKE = "#25272a";
const AXIS_STROKE = "#2f3236";
const LABEL_FILL = "#6b7280";
/** Match m14 mockup stroke-width. */
const LINE_WIDTH = 2.25;

/** Keras / orcAI: monitor `val_MBA` → train series key `MBA`. */
export function trainMetricKey(monitor: string): string {
  const m = (monitor || "val_MBA").trim();
  if (/^val_/i.test(m)) return m.slice(4);
  return "MBA";
}

export function historySeries(
  history: Record<string, number[]> | undefined,
  key: string,
): number[] {
  if (!history || !key) return [];
  const direct = history[key];
  if (Array.isArray(direct) && direct.length) return direct;
  const want = key.toLowerCase();
  for (const [k, series] of Object.entries(history)) {
    if (k.toLowerCase() === want && Array.isArray(series) && series.length) {
      return series;
    }
  }
  return [];
}

/** Drop non-finite samples so canvas paths stay clean (no zero-length “blobs”). */
export function finiteSeries(series: number[]): number[] {
  return series.filter((v) => Number.isFinite(v));
}

/**
 * Epoch count for the X-axis: only finished Keras epochs (history length).
 * Live mid-epoch train must not invent a new tick — validation is not ready yet.
 */
export function completedEpochCount(train: number[], val: number[]): number {
  return Math.max(finiteSeries(train).length, finiteSeries(val).length, 0);
}

/** True when validation has ≥2 points and never moved (within eps). */
export function isValStagnant(val: number[], eps = 1e-6): boolean {
  const series = finiteSeries(val);
  if (series.length < 2) return false;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  return hi - lo <= eps;
}

function formatMetric(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

type Props = {
  train: number[];
  val: number[];
  best: number | null;
  bestEpoch: number | null;
  monitor: string;
  trainLabel: string;
  /** Live mid-epoch train metric (not yet in history). */
  provisionalTrain: number | null;
  /** 1-based epoch currently running (for live caption). */
  liveEpoch?: number | null;
};

/**
 * Canvas chart (not SVG): WKWebView paints SVG strokes as round linecap dots
 * when ancestors use backdrop-filter / certain compositing layers.
 *
 * Style follows m14: two clean polylines only — no per-epoch vertex fills, no
 * live marker on the plot (live MBA is the caption / KPI), butt caps so flat
 * val_MBA does not read as a thick “sausage”.
 * X-axis = completed epochs only.
 */
export function MetricChart({
  train,
  val,
  best,
  bestEpoch,
  monitor,
  trainLabel,
  provisionalTrain,
  liveEpoch = null,
}: Props) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  const trainFinite = finiteSeries(train);
  const valRaw = finiteSeries(val);
  // Near-flat validation → draw as a true horizontal (avoids 1e-7 zig-zag).
  const valFinite = isValStagnant(valRaw)
    ? valRaw.map(() => valRaw[0]!)
    : valRaw;
  const hasProvisional =
    provisionalTrain != null && Number.isFinite(provisionalTrain);
  const n = Math.max(completedEpochCount(trainFinite, valFinite), 1);
  const all = [...trainFinite, ...valFinite];
  if (hasProvisional) all.push(provisionalTrain as number);
  const domain = chartYDomain(all);

  const stagnant = useMemo(() => isValStagnant(val), [val]);

  const chartTitle = (i18n.language || "en").toLowerCase().startsWith("ru")
    ? `МЕТРИКА ${monitor} ПО ЭПОХАМ`
    : `METRIC ${monitor} BY EPOCH`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const plot = plotRef.current;
    if (!canvas || !plot) return;

    const draw = () => {
      const cssW = Math.max(1, plot.clientWidth);
      const cssH = Math.max(1, plot.clientHeight);
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const w = cssW;
      const h = cssH;
      const l = 48;
      const r = 16;
      const top = 12;
      const bot = 28;
      const iw = Math.max(1, w - l - r);
      const ih = Math.max(1, h - top - bot);
      const y0 = domain.min;
      const y1 = domain.max;
      const ySpan = y1 - y0 || 1;
      const xPad = Math.min(10, iw * 0.04);

      const xAt = (i: number) => {
        const count = Math.max(n, 1);
        if (count <= 1) return l + iw / 2;
        return l + xPad + (i / (count - 1)) * (iw - 2 * xPad);
      };
      const yAt = (v: number) => top + ih - ((v - y0) / ySpan) * ih;

      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.setLineDash([]);
      ctx.strokeStyle = GRID_STROKE;
      for (const tick of domain.ticks) {
        const y = yAt(tick);
        ctx.beginPath();
        ctx.moveTo(l, y);
        ctx.lineTo(l + iw, y);
        ctx.stroke();
        ctx.fillStyle = LABEL_FILL;
        ctx.font = "10px ui-monospace, Menlo, Monaco, Consolas, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(formatTick(tick), l - 8, y);
      }

      ctx.strokeStyle = AXIS_STROKE;
      ctx.beginPath();
      ctx.moveTo(l, top);
      ctx.lineTo(l, top + ih);
      ctx.lineTo(l + iw, top + ih);
      ctx.stroke();

      const strokeSeries = (series: number[], color: string) => {
        if (series.length === 0) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineJoin = "round";
        // Butt caps: round caps fatten flat val_MBA into a “sausage”.
        ctx.lineCap = "butt";
        ctx.setLineDash([]);
        if (series.length === 1) {
          ctx.beginPath();
          ctx.arc(xAt(0), yAt(series[0]!), 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }
        ctx.beginPath();
        series.forEach((v, i) => {
          const x = xAt(i);
          const y = yAt(v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      };

      // Completed epochs only (m14): two polylines, no live marker / best halo.
      strokeSeries(trainFinite, TRAIN_STROKE);
      strokeSeries(valFinite, VAL_STROKE);

      const xIdx =
        n <= 1
          ? [0]
          : n <= 4
            ? Array.from({ length: n }, (_, i) => i)
            : [
                0,
                Math.floor((n - 1) / 3),
                Math.floor((2 * (n - 1)) / 3),
                n - 1,
              ];
      ctx.fillStyle = LABEL_FILL;
      ctx.font = "10px ui-monospace, Menlo, Monaco, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (const i of xIdx) {
        ctx.fillText(String(i + 1), xAt(i), h - 8);
      }
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(plot);
    return () => ro.disconnect();
  }, [
    train,
    val,
    provisionalTrain,
    hasProvisional,
    domain.min,
    domain.max,
    domain.ticks.join(","),
    n,
    best,
    trainFinite,
    valFinite,
  ]);

  const liveCaption =
    hasProvisional
      ? t("monitor.chartLiveEpoch", {
          epoch: liveEpoch ?? trainFinite.length + 1,
          train: formatMetric(provisionalTrain),
          trainKey: trainLabel,
          valKey: monitor || "val_MBA",
        })
      : null;

  const stagnantCaption = stagnant
    ? t("monitor.chartValFlat", {
        metric: monitor || "val_MBA",
        epoch: bestEpoch ?? 1,
        value: formatMetric(best ?? valFinite[0]),
      })
    : null;

  return (
    <div className="tm-chart-wrap">
      <div className="tm-chart-head">
        <h3 className="tm-chart-title">
          {(i18n.language || "en").toLowerCase().startsWith("ru") ? (
            <>
              МЕТРИКА <span className="tm-chart-metric">{monitor}</span> ПО ЭПОХАМ
            </>
          ) : (
            <>
              METRIC <span className="tm-chart-metric">{monitor}</span> BY EPOCH
            </>
          )}
        </h3>
        <div className="tm-chart-head-side">
          {best != null ? (
            <span className="tm-chart-best">
              {t("monitor.best", { value: formatMetric(best) })}
            </span>
          ) : null}
          <div className="tm-chart-legend" aria-hidden>
            <span className="tm-legend-item tm-legend-item--train">{trainLabel}</span>
            <span className="tm-legend-item tm-legend-item--val">
              {monitor || "val_MBA"}
            </span>
          </div>
        </div>
      </div>
      <p className="tm-chart-hint">{t("monitor.chartHint")}</p>
      {(liveCaption || stagnantCaption) && (
        <div className="tm-chart-notes" role="status">
          {liveCaption ? <p className="tm-chart-note tm-chart-note--live">{liveCaption}</p> : null}
          {stagnantCaption ? (
            <p className="tm-chart-note tm-chart-note--flat">{stagnantCaption}</p>
          ) : null}
        </div>
      )}
      <div className="tm-chart-plot" ref={plotRef}>
        <canvas
          ref={canvasRef}
          className="tm-chart-canvas"
          role="img"
          aria-label={chartTitle}
        />
        {!trainFinite.length && !valFinite.length ? (
          <p className="tm-chart-empty">{t("monitor.chartEmpty")}</p>
        ) : null}
      </div>
    </div>
  );
}
