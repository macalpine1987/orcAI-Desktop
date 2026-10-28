import clsx from "clsx";
import { formatAppVersion } from "../lib/appVersion";

export function AppBrand({
  compact = false,
  studio = false,
}: {
  compact?: boolean;
  /** m16 jobs: single-line ~10px header brand */
  studio?: boolean;
}) {
  if (studio) {
    return (
      <div className="app-brand app-brand--studio">
        <span className="app-brand-studio-name tracking-tight">
          orc<span className="font-normal">AI</span>
        </span>
        <span className="app-brand-studio-desktop">Desktop</span>
        <span
          className="app-brand-studio-version font-mono tabular-nums"
          title={formatAppVersion()}
        >
          {formatAppVersion()}
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex items-baseline gap-1.5",
        compact && "flex-col gap-0",
      )}
    >
      <span className="text-lg font-semibold tracking-tight text-foreground">
        orc<span className="font-normal">AI</span>
      </span>
      {!compact && (
        <>
          <span className="text-base font-light text-foreground-muted">
            Desktop
          </span>
          <span
            className="text-sm font-mono font-normal tabular-nums text-foreground-muted/80"
            title={formatAppVersion()}
          >
            {formatAppVersion()}
          </span>
        </>
      )}
    </div>
  );
}
