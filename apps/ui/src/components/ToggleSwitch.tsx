import clsx from "clsx";

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "settings-toggle",
        checked && "settings-toggle--on",
        disabled && "opacity-40",
      )}
    >
      <span className="settings-toggle-thumb" aria-hidden />
    </button>
  );
}
