import type { ReactNode } from "react";

export function SettingsRow({
  title,
  hint,
  children,
  footer,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="settings-interface-row">
      <div className="settings-interface-row-label">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {hint ? (
          <p className="mt-1 max-w-md text-xs text-foreground-muted">{hint}</p>
        ) : null}
      </div>
      <div className="settings-interface-row-control">
        {children}
        {footer}
      </div>
    </div>
  );
}
