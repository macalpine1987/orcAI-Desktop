import { IconCircularReset } from "./SpectrogramIcons";

type Props = {
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
};

/** Small yellow–orange circular reset chip (screenshot style). */
export function SpectrogramSliderResetButton({
  label,
  hint,
  disabled = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      className="predict-logic-slider-reset-btn"
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
    >
      <IconCircularReset size={11} />
    </button>
  );
}
