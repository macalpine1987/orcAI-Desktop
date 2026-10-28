import { useTranslation } from "react-i18next";
import {
  frequencyAxisTicks,
  SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ,
  SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ,
} from "../lib/spectrogramAxisTicks";

type Props = {
  axisMaxHz: number;
  height: number;
  /** When true, unit is shown in the axis corner instead of atop this scale. */
  unitInCorner?: boolean;
  /** Hide 0 / max kHz labels and inset the top label to avoid edge overlap. */
  compactEdgeLabels?: boolean;
  /** Adaptive label density (MATLAB/Audacity-style auto-ticking). */
  autoTick?: boolean;
  /**
   * Visible time-window span. With autoTick, densifies kHz labels under
   * time-zoom while keeping YLim fixed (0–axisMaxHz).
   */
  timeViewSpanSec?: number;
  /**
   * Fixed major step in kHz. m04 scientific uses 2 (16,14,…,2).
   * Overrides autoTick density when set.
   */
  labelStepKhz?: number;
};

export function SpectrogramFrequencyAxis({
  axisMaxHz,
  height,
  unitInCorner = false,
  compactEdgeLabels = false,
  autoTick = false,
  timeViewSpanSec,
  labelStepKhz,
}: Props) {
  const { t } = useTranslation();
  const specHeight = Math.max(1, height);
  const fixedStep =
    labelStepKhz != null && labelStepKhz > 0
      ? labelStepKhz
      : undefined;
  const ticks = frequencyAxisTicks(
    axisMaxHz,
    fixedStep != null
      ? { labelStepKhz: fixedStep }
      : autoTick
        ? {
            plotHeightPx: specHeight,
            timeViewSpanSec,
          }
        : undefined,
  );
  const maxKhz = axisMaxHz > 0 ? axisMaxHz / 1000 : SPECTROGRAM_FREQUENCY_AXIS_MAX_KHZ;

  return (
    <div
      className="analysis-frequency-axis-width flex shrink-0"
      style={{ height: specHeight }}
      aria-label={t("spectrogram.frequencyAxis.ariaLabel")}
    >
      <div className="analysis-frequency-axis-scale relative h-full w-full font-mono text-foreground-muted">
        {!unitInCorner ? (
          <span className="analysis-frequency-axis-unit" aria-hidden>
            {t("spectrogram.frequencyAxis.unit")}
          </span>
        ) : null}
        {ticks.map((tick) => {
          const isMin = tick.khz <= 0.001;
          const isMax = Math.abs(tick.khz - maxKhz) < 0.001;
          // m04: label 16…2; keep tick mark at 0 without a "0" digit.
          const showLabel =
            Boolean(tick.label) && !(compactEdgeLabels && isMin);

          return (
            <div
              key={`${tick.khz}-${tick.major ? "m" : "n"}`}
              className={
                compactEdgeLabels && isMax
                  ? "analysis-frequency-axis-tick analysis-frequency-axis-tick-top absolute inset-x-0 flex items-start justify-end gap-0.5"
                  : "analysis-frequency-axis-tick absolute inset-x-0 flex -translate-y-1/2 items-center justify-end gap-0.5"
              }
              style={{ top: `${tick.yFrac * 100}%` }}
            >
              {showLabel ? (
                <span
                  className={
                    compactEdgeLabels && isMax
                      ? "analysis-frequency-axis-tick-label analysis-frequency-axis-tick-label-top"
                      : "analysis-frequency-axis-tick-label"
                  }
                >
                  {tick.label}
                </span>
              ) : null}
              <span
                className="analysis-axis-tick-mark analysis-axis-tick-mark-y"
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ };
