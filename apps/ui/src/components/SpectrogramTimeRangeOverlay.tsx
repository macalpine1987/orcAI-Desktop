import { useTranslation } from "react-i18next";
import { formatSpectrogramAxisTime } from "../lib/spectrogramTimeTicks";
import {
  normalizeTimeRange,
  timeRangeBandInView,
  type TimeRangeSec,
} from "../lib/spectrogramTimeRange";

type Props = {
  range: TimeRangeSec;
  viewStart: number;
  viewSpan: number;
  variant: "draft" | "loop";
};

export function SpectrogramTimeRangeOverlay({
  range,
  viewStart,
  viewSpan,
  variant,
}: Props) {
  const { t } = useTranslation();
  const band = timeRangeBandInView(range, viewStart, viewSpan);
  if (!band) return null;

  const { t0, t1 } = normalizeTimeRange(range.t0, range.t1);
  const isLoop = variant === "loop";
  const className = isLoop
    ? "analysis-loop-region"
    : "analysis-time-selection-draft";

  return (
    <div
      className={`analysis-time-range-overlay pointer-events-none absolute inset-y-0 ${className}`}
      style={{
        left: `${band.leftPct}%`,
        width: `${Math.max(band.widthPct, 0.35)}%`,
      }}
      aria-hidden
    >
      <span className="analysis-time-range-edge analysis-time-range-edge-start" />
      <span className="analysis-time-range-edge analysis-time-range-edge-end" />
      <div className="analysis-time-range-label">
        <span className="analysis-time-range-label-pill">
          {formatSpectrogramAxisTime(t0)} – {formatSpectrogramAxisTime(t1)}
        </span>
        {!isLoop ? (
          <span className="analysis-time-range-label-hint">
            {t("spectrogram.timeSelection.hint")}
          </span>
        ) : (
          <span className="analysis-time-range-label-hint">
            {t("spectrogram.timeSelection.loopActive")}
          </span>
        )}
      </div>
    </div>
  );
}
