import { useTranslation } from "react-i18next";
import { IconVolume } from "./SpectrogramIcons";

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Logic Pro dark chrome for Predict Results toolbar. */
  logicPro?: boolean;
};

function volumePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function SpectrogramVolumeControl({
  value,
  onChange,
  disabled = false,
  logicPro = false,
}: Props) {
  const { t } = useTranslation();
  const pct = volumePercent(value);

  if (logicPro) {
    return (
      <div
        className="predict-logic-slider-frame predict-logic-volume"
        title={t("spectrogram.player.volumeLevelHint")}
      >
        <span className="predict-logic-slider-caption" aria-hidden>
          {t("spectrogram.volume")}
        </span>
        <span className="predict-logic-volume-icon" aria-hidden>
          <IconVolume size={14} />
        </span>
        <label className="predict-logic-volume-slider">
          <span className="sr-only">{t("spectrogram.player.volumeLevel")}</span>
          <input
            type="range"
            className="predict-logic-range-input"
            min={0}
            max={1}
            step={0.05}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t("spectrogram.player.volumeLevel")}
            style={{ ["--slider-pct" as string]: `${pct}%` }}
          />
        </label>
        <span className="predict-logic-volume-value">{pct}%</span>
      </div>
    );
  }

  return (
    <label
      className="flex min-w-[8rem] flex-1 items-center gap-1.5 text-[10px] text-foreground-muted"
      title={t("spectrogram.player.volumeLevelHint")}
    >
      <span className="shrink-0 text-foreground-muted" aria-hidden>
        <IconVolume size={14} />
      </span>
      <span className="shrink-0">{t("spectrogram.player.volumeLevel")}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t("spectrogram.player.volumeLevel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 flex-1 accent-accent"
      />
      <span className="w-8 shrink-0 text-right font-mono tabular-nums">{pct}%</span>
    </label>
  );
}
