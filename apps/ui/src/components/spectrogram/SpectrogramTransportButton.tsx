import type { ReactNode } from "react";

export function SpectrogramTransportButton({
  label,
  hint,
  disabled,
  pressed,
  primary,
  embedded,
  logicPro,
  className,
  preserveTimeSelection,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
  embedded?: boolean;
  logicPro?: boolean;
  className?: string;
  /** Keep spectrogram time selection when this control is pressed (e.g. Loop). */
  preserveTimeSelection?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  if (logicPro) {
    return (
      <button
        type="button"
        aria-label={label}
        title={hint}
        disabled={disabled}
        aria-pressed={pressed}
        data-preserve-time-selection={
          preserveTimeSelection ? "" : undefined
        }
        onClick={onClick}
        className={
          className
            ? `predict-logic-transport-btn ${className}`
            : "predict-logic-transport-btn"
        }
      >
        {children}
      </button>
    );
  }

  if (embedded) {
    return (
      <button
        type="button"
        aria-label={label}
        title={hint}
        disabled={disabled}
        aria-pressed={pressed}
        data-preserve-time-selection={
          preserveTimeSelection ? "" : undefined
        }
        onClick={onClick}
        className="analysis-transport-btn"
      >
        {children}
      </button>
    );
  }

  const size = primary ? "h-9 w-9" : "h-8 w-8";
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      data-preserve-time-selection={
        preserveTimeSelection ? "" : undefined
      }
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 ${size} ${
        pressed
          ? "border-accent bg-accent/15 text-accent"
          : primary
            ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
            : "border-border bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
