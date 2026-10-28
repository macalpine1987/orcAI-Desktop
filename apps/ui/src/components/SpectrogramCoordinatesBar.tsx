import { useTranslation } from "react-i18next";

type Props = {
  timeSec: number | null;
  frequencyLabel: string | null;
  segmentIndex: number;
};

export function SpectrogramCoordinatesBar({
  timeSec,
  frequencyLabel,
  segmentIndex,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="analysis-coordinates-bar flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground-muted"
      aria-live="polite"
    >
      <span>
        {t("spectrogram.coordinates.time")}:{" "}
        <strong className="font-semibold text-foreground">
          {timeSec != null
            ? `${timeSec.toFixed(1)} ${t("spectrogram.toolbar.secUnit")}`
            : "—"}
        </strong>
      </span>
      <span>
        {t("spectrogram.coordinates.frequency")}:{" "}
        <strong className="font-semibold text-foreground">
          {frequencyLabel ?? "—"}
        </strong>
      </span>
      <span className="text-foreground-muted">
        {t("spectrogram.segment.statusIndex", { index: segmentIndex + 1 })}
      </span>
    </div>
  );
}
