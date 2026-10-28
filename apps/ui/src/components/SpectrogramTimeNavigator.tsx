import { useTranslation } from "react-i18next";

type Props = {
  durationSec: number;
  viewStart: number;
  viewSpan: number;
  onViewStartChange: (start: number) => void;
};

export function SpectrogramTimeNavigator({
  durationSec,
  viewStart,
  viewSpan,
  onViewStartChange,
}: Props) {
  const { t } = useTranslation();
  const canScroll = durationSec > 0 && viewSpan < durationSec - 0.01;
  const maxStart = Math.max(0, durationSec - viewSpan);

  if (!canScroll) return null;

  const windowLeftPct = (viewStart / durationSec) * 100;
  const windowWidthPct = (viewSpan / durationSec) * 100;

  return (
    <div className="flex flex-col gap-1 px-0.5 pt-1">
      <input
        type="range"
        min={0}
        max={maxStart}
        step={Math.max(0.01, viewSpan / 200)}
        value={viewStart}
        onChange={(e) => onViewStartChange(Number(e.target.value))}
        className="h-2 w-full cursor-ew-resize accent-foreground"
        aria-label={t("spectrogram.scrollTimeline")}
      />
      <div
        className="relative h-1.5 w-full overflow-hidden rounded bg-muted"
        aria-hidden
      >
        <div
          className="absolute top-0 h-full rounded bg-foreground/35"
          style={{
            left: `${windowLeftPct}%`,
            width: `${Math.max(0.5, windowWidthPct)}%`,
          }}
        />
      </div>
      <p className="text-[10px] text-foreground-muted">{t("spectrogram.scrollHint")}</p>
    </div>
  );
}
