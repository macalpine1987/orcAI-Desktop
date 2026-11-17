import type { TrainMonitorSnapshot } from "../api/projects";

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatMetric(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatLr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e-2 && abs < 1e3) return value.toPrecision(4);
  return value.toExponential(2);
}

export function TrainMonitorKpiRow({
  snap,
  monitorMetricValue,
  elapsedLive,
  remainingLive,
  trainingStopped,
  busy,
  t,
}: {
  snap: TrainMonitorSnapshot | null;
  monitorMetricValue: number | null | undefined;
  elapsedLive: number | null | undefined;
  remainingLive: number | null | undefined;
  trainingStopped: boolean;
  busy: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="tm-kpi-row">
      <div className="tm-kpi">
        <span className="tm-kpi-label">{t("monitor.kpi.epoch")}</span>
        <span className="tm-kpi-value">
          {snap ? `${snap.epoch}/${snap.epochs}` : "—"}
        </span>
      </div>
      <div className="tm-kpi">
        <span className="tm-kpi-label">
          {snap?.monitor?.toUpperCase() || "VAL_MBA"}
        </span>
        <span className="tm-kpi-value tm-kpi-value--accent">
          {formatMetric(monitorMetricValue)}
        </span>
      </div>
      <div className="tm-kpi">
        <span className="tm-kpi-label">{t("monitor.kpi.loss")}</span>
        <span className="tm-kpi-value">
          {formatMetric(snap?.metrics.loss)}
        </span>
      </div>
      <div className="tm-kpi">
        <span className="tm-kpi-label">{t("monitor.kpi.lr")}</span>
        <span className="tm-kpi-value">
          {formatLr(snap?.metrics.learning_rate)}
        </span>
      </div>
      <div className="tm-kpi">
        <span className="tm-kpi-label">{t("monitor.kpi.elapsed")}</span>
        <span className="tm-kpi-value">
          {formatDuration(elapsedLive)}
        </span>
      </div>
      <div className="tm-kpi">
        <span className="tm-kpi-label">{t("monitor.kpi.remaining")}</span>
        <span className="tm-kpi-value">
          {trainingStopped
            ? "—"
            : remainingLive != null
              ? remainingLive <= 0 && !busy
                ? "0:00"
                : `≈${formatDuration(remainingLive)}`
              : "—"}
        </span>
      </div>
    </div>
  );
}

export { formatDuration, formatMetric, formatLr };
