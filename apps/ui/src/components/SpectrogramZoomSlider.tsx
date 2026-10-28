import { useTranslation } from "react-i18next";
import { IconZoomIn, IconZoomOut } from "./SpectrogramIcons";
import { SpectrogramSliderResetButton } from "./SpectrogramSliderResetButton";

type Props = {
  /** 0 = default (widest) view · 1 = maximum zoom in */
  value: number;
  /** Live updates while dragging (axes / CSS preview). */
  onChange: (value: number) => void;
  /** Fired when the user releases the slider — flush tile fetch. */
  onCommit?: () => void;
  disabled?: boolean;
};

const ZOOM_DEFAULT = 0;

function zoomPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function SpectrogramZoomSlider({
  value,
  onChange,
  onCommit,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const pct = zoomPercent(value);
  const atDefault = value <= 0.001;

  const commit = () => {
    onCommit?.();
  };

  return (
    <div
      className="predict-logic-slider-frame predict-logic-zoom"
      data-spectrogram-zoom=""
      title={t("spectrogram.toolbar.zoomSliderHint")}
    >
      <span className="predict-logic-slider-caption" aria-hidden>
        {t("spectrogram.toolbar.zoomCaption")}
      </span>
      <span className="predict-logic-zoom-icon" aria-hidden>
        <IconZoomOut />
      </span>
      <label className="predict-logic-zoom-slider">
        <span className="sr-only">{t("spectrogram.toolbar.zoomSliderLabel")}</span>
        <input
          type="range"
          className="predict-logic-range-input"
          min={0}
          max={1}
          step={0.01}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("spectrogram.toolbar.zoomSliderLabel")}
          style={{ ["--slider-pct" as string]: `${pct}%` }}
        />
      </label>
      <span className="predict-logic-zoom-icon predict-logic-zoom-icon-in" aria-hidden>
        <IconZoomIn />
      </span>
      <span className="predict-logic-zoom-value">{pct}%</span>
      <SpectrogramSliderResetButton
        label={t("spectrogram.toolbar.zoomSliderReset")}
        hint={t("spectrogram.toolbar.zoomSliderResetHint")}
        disabled={disabled || atDefault}
        onClick={() => {
          onChange(ZOOM_DEFAULT);
          onCommit?.();
        }}
      />
    </div>
  );
}
