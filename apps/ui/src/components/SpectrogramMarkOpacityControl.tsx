import { useTranslation } from "react-i18next";
import { SPECTROGRAM_MARK_OPACITY_DEFAULT } from "../lib/spectrogramMarkOpacity";
import { IconMarkOpacity, IconZoomReset } from "./SpectrogramIcons";
import { SpectrogramSliderResetButton } from "./SpectrogramSliderResetButton";

type Props = {
  value: number;
  onChange: (value: number) => void;
  /** Logic Pro dark chrome for Predict Results toolbar. */
  logicPro?: boolean;
  /** Disable slider when no labels are available. */
  disabled?: boolean;
};

export function SpectrogramMarkOpacityControl({
  value,
  onChange,
  logicPro = false,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const atDefault = value === SPECTROGRAM_MARK_OPACITY_DEFAULT;
  /** m04 labels this control «Прозрачность» on the Results transport. */
  const label = logicPro
    ? t("spectrogram.toolbar.contrastLabel")
    : t("spectrogram.toolbar.markOpacityLabel");
  const hint = logicPro
    ? t("spectrogram.toolbar.contrastHint")
    : t("spectrogram.toolbar.markOpacityHint");

  if (logicPro) {
    return (
      <div
        className={`predict-logic-slider-frame predict-logic-mark-opacity${
          disabled ? " is-disabled" : ""
        }`}
        title={hint}
      >
        <span className="predict-logic-slider-caption" aria-hidden>
          {t("spectrogram.toolbar.contrastCaption")}
        </span>
        <span className="predict-logic-mark-opacity-icon" title={hint}>
          <IconMarkOpacity />
        </span>
        <label className="predict-logic-mark-opacity-slider">
          <span className="sr-only">{label}</span>
          <input
            type="range"
            className="predict-logic-range-input"
            min={0}
            max={100}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-label={label}
            style={{ ["--slider-pct" as string]: `${value}%` }}
          />
        </label>
        <span className="predict-logic-mark-opacity-value" aria-hidden>
          {value}%
        </span>
        <SpectrogramSliderResetButton
          label={t("spectrogram.toolbar.markOpacityReset")}
          hint={t("spectrogram.toolbar.markOpacityResetHint")}
          disabled={disabled || atDefault}
          onClick={() => onChange(SPECTROGRAM_MARK_OPACITY_DEFAULT)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex min-w-[9rem] flex-1 items-center gap-2 sm:min-w-[11rem] sm:max-w-[14rem]"
      title={hint}
    >
      <span className="text-foreground-muted" title={hint}>
        <IconMarkOpacity />
      </span>
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="sr-only">{label}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-accent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label={label}
        />
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
          {value}%
        </span>
      </label>
      <button
        type="button"
        aria-label={t("spectrogram.toolbar.markOpacityReset")}
        title={t("spectrogram.toolbar.markOpacityResetHint")}
        disabled={atDefault || disabled}
        onClick={() => onChange(SPECTROGRAM_MARK_OPACITY_DEFAULT)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
      >
        <IconZoomReset />
      </button>
    </div>
  );
}
