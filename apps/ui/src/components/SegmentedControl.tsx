import clsx from "clsx";

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  "aria-label"?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="settings-segmented"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={clsx(
            "settings-segmented-btn",
            value === opt.value && "settings-segmented-btn-active",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
