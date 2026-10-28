import { useTranslation } from "react-i18next";
import { timeAxisMarks } from "../lib/spectrogramTimeTicks";

type Props = {
  viewStart: number;
  viewEnd: number;
  plotWidthPx?: number;
  /** Pin axis width to the measured spectrogram plot (px). Prefer fill when omitted. */
  widthPx?: number;
  autoTick?: boolean;
};

export function SpectrogramTimeAxis({
  viewStart,
  viewEnd,
  plotWidthPx,
  widthPx,
  autoTick = false,
}: Props) {
  const { t } = useTranslation();
  const tickOptions = autoTick
    ? {
        scientificGrid: true as const,
        ...(plotWidthPx != null && plotWidthPx > 0
          ? { plotWidthPx }
          : {}),
      }
    : undefined;
  const marks = timeAxisMarks(viewStart, viewEnd, tickOptions);

  return (
    <div
      className="analysis-time-axis-scale relative h-7 min-w-0 shrink-0 font-mono text-[9px] text-foreground-muted"
      style={
        widthPx != null && widthPx > 0
          ? { width: `${widthPx}px`, flex: "0 0 auto" }
          : { flex: "1 1 auto", width: "100%", minWidth: 0 }
      }
      aria-label={t("spectrogram.timeAxis.ariaLabel")}
    >
      {marks.map((mark) => {
        const atPlotStart = mark.xFrac <= 0.001;
        const atPlotEnd = mark.xFrac >= 0.999;
        const hasLabel = Boolean(mark.label);
        const gapClass = hasLabel ? "gap-0.5" : "";

        return (
          <div
            key={`${mark.tSec}-${mark.xFrac}`}
            className={`analysis-time-axis-tick absolute top-0 flex -translate-x-1/2 flex-col items-center ${gapClass}${
              atPlotStart ? " analysis-time-axis-tick-start" : ""
            }${atPlotEnd ? " analysis-time-axis-tick-end" : ""}`}
            style={{ left: `${mark.xFrac * 100}%` }}
            data-at-edge={atPlotStart ? "start" : atPlotEnd ? "end" : undefined}
          >
            <span
              className={`analysis-axis-tick-mark analysis-axis-tick-mark-x${
                mark.label ? "" : " analysis-axis-tick-mark-x-minor"
              }`}
              aria-hidden
            />
            {mark.label ? (
              <span
                className={
                  atPlotStart
                    ? "analysis-time-axis-tick-label analysis-time-axis-tick-label-start"
                    : atPlotEnd
                      ? "analysis-time-axis-tick-label analysis-time-axis-tick-label-end"
                      : "analysis-time-axis-tick-label"
                }
              >
                {mark.label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
