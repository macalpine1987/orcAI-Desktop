import type { KeyboardEvent, ReactNode } from "react";

export type PredictTabId = "run" | "results" | "filter";

export function predictTabDomId(id: PredictTabId): string {
  return `predict-tab-${id}`;
}

export function predictTabPanelDomId(id: PredictTabId): string {
  return `predict-tabpanel-${id}`;
}

export function PredictTabs({
  active,
  onChange,
  tabs,
  disabled,
  ariaLabel,
  className,
}: {
  active: PredictTabId;
  onChange: (id: PredictTabId) => void;
  tabs: {
    id: PredictTabId;
    label: string;
    badge?: string;
    badgeTitle?: string;
    disabled?: boolean;
    disabledTitle?: string;
  }[];
  disabled?: boolean;
  ariaLabel: string;
  /** Optional extra class (m03: `predict-tabs-m03`). */
  className?: string;
}) {
  const enabledTabs = tabs.filter((tab) => !(disabled || tab.disabled));

  const focusTab = (id: PredictTabId) => {
    onChange(id);
    window.requestAnimationFrame(() => {
      document.getElementById(predictTabDomId(id))?.focus();
    });
  };

  const onTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    tabId: PredictTabId,
  ) => {
    if (enabledTabs.length === 0) return;
    const idx = enabledTabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = enabledTabs[(idx + 1) % enabledTabs.length];
      focusTab(next.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev =
        enabledTabs[(idx - 1 + enabledTabs.length) % enabledTabs.length];
      focusTab(prev.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(enabledTabs[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(enabledTabs[enabledTabs.length - 1].id);
    }
  };

  return (
    <div
      className={className ?? "flex flex-wrap gap-2"}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const tabId = predictTabDomId(tab.id);
        const panelId = predictTabPanelDomId(tab.id);
        const isM03 = Boolean(className?.includes("predict-tabs-m03"));
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || tab.disabled}
            title={tab.disabled ? tab.disabledTitle : undefined}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onTabKeyDown(e, tab.id)}
            className={
              isM03
                ? "predict-tab"
                : `mat-btn flex min-w-[7.5rem] flex-1 items-center justify-center gap-2 px-3 py-2.5 text-center text-sm sm:flex-initial ${
                    selected
                      ? "mat-btn-primary border-accent"
                      : "text-foreground-muted"
                  } disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40`
            }
          >
            <span className="truncate">{tab.label}</span>
            {tab.badge ? (
              <span
                title={tab.badgeTitle}
                className={
                  isM03
                    ? "predict-tab-badge"
                    : `max-w-[6.5rem] shrink-0 truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight tabular-nums ${
                        selected
                          ? "border-accent-fg/30 bg-accent-fg/15 text-accent-fg"
                          : "border-border bg-mat-recess text-foreground-muted"
                      }`
                }
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PredictTabPanel({
  id,
  active,
  children,
}: {
  id: PredictTabId;
  active: PredictTabId;
  children: ReactNode;
}) {
  const hidden = id !== active;
  return (
    <div
      id={predictTabPanelDomId(id)}
      role="tabpanel"
      aria-labelledby={predictTabDomId(id)}
      hidden={hidden}
      className={hidden ? "hidden" : "predict-tab-panel"}
    >
      {children}
    </div>
  );
}
