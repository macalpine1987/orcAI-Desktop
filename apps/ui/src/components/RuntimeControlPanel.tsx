import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { RuntimeStep } from "../lib/runtimeProgress";

type ComponentLine = {
  label: string;
  status: string;
  detail?: string | null;
  ok: boolean;
  active: boolean;
  error?: boolean;
  /** Blue dot when ok (e.g. accelerator available). */
  available?: boolean;
};

export type RuntimePanelModel = {
  id: string;
  name: string;
  kind: "builtin" | "trained";
};

type Props = {
  runtimeStep: RuntimeStep;
  sidecarLine: ComponentLine;
  engineLine: ComponentLine;
  pythonLine?: ComponentLine | null;
  acceleratorLine?: ComponentLine | null;
  /** Shown after Sidecar + engine are ready. */
  models?: RuntimePanelModel[];
  canStart: boolean;
  canRestart: boolean;
  canStop: boolean;
  busy: boolean;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  runtimeAutostart?: boolean;
  onRuntimeAutostartChange?: (enabled: boolean) => void;
  className?: string;
};

function IconRuntimeStart({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M5.2 3.1c0-.45.48-.73.87-.52l7.2 4.05c.4.23.4.82 0 1.04l-7.2 4.05c-.39.22-.87-.06-.87-.52V3.1Z" />
    </svg>
  );
}

function IconRuntimeRestart({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M13.2 8A5.2 5.2 0 1 1 11.4 4.1" />
      <path d="M13.2 2.6v3.2h-3.2" />
    </svg>
  );
}

function RuntimeComponentRow({ line }: { line: ComponentLine }) {
  const tone = line.error
    ? "error"
    : line.ok
      ? line.available
        ? "available"
        : "ready"
      : line.active
        ? "active"
        : "stopped";

  return (
    <li className={clsx("runtime-component-row", `is-${tone}`)}>
      <span
        className={clsx("runtime-row-lamp", `is-${tone}`)}
        aria-hidden
      >
        <span className="runtime-row-lamp-well">
          <span className="runtime-row-lamp-jewel" />
        </span>
      </span>
      {/*
        m01: label + detail under it; status on the right.
        Detail slot is always present so the panel is pre-expanded before start —
        gray copy fills in when the component is running.
      */}
      <div className="runtime-component-main min-w-0">
        <span className="runtime-component-label">{line.label}</span>
        <span
          className={clsx(
            "runtime-component-detail",
            !line.detail && "is-empty",
          )}
          title={line.detail ?? undefined}
        >
          {line.detail ?? "\u00a0"}
        </span>
      </div>
      <span className={clsx("runtime-component-status", `is-${tone}`)}>
        {line.status}
      </span>
    </li>
  );
}

export function RuntimeControlPanel({
  runtimeStep,
  sidecarLine,
  engineLine,
  pythonLine = null,
  acceleratorLine = null,
  models = [],
  canStart,
  canRestart,
  canStop,
  busy,
  onStart,
  onRestart,
  onStop,
  runtimeAutostart,
  onRuntimeAutostartChange,
  className,
}: Props) {
  const { t } = useTranslation();
  const showModels = runtimeStep === "ready" && models.length > 0;
  const componentLines = [
    sidecarLine,
    engineLine,
    pythonLine,
    acceleratorLine,
  ].filter((line): line is ComponentLine => line != null);
  const primaryAction = canStart
    ? "start"
    : canRestart
      ? "restart"
      : null;

  return (
    <section className={clsx("mat-card home-runtime-panel flex flex-col p-4", className)}>
      <h2 className="home-card-eyebrow">{t("home.runtimePanel")}</h2>

      <ul className="home-runtime-rows mt-3 space-y-2.5 text-xs">
        {componentLines.map((line) => (
          <RuntimeComponentRow key={line.label} line={line} />
        ))}
      </ul>

      {showModels ? (
        <div className="mt-3 border-t border-border pt-3 text-xs">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
            <span>{t("home.runtimeModelsColumn")}</span>
            <span>{t("home.runtimeModelsTypeColumn")}</span>
          </div>
          <ul className="space-y-1.5" aria-label={t("home.runtimeModelsColumn")}>
            {models.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-foreground"
              >
                <span className="min-w-0 truncate font-mono" title={m.name}>
                  {m.name}
                </span>
                <span className="shrink-0 text-foreground-muted">
                  {m.kind === "trained"
                    ? t("home.runtimeModelKindTrained")
                    : t("home.runtimeModelKindBuiltin")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="home-runtime-footer mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {primaryAction ? (
            <button
              type="button"
              disabled={busy}
              onClick={primaryAction === "start" ? onStart : onRestart}
              className="mat-btn inline-flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {primaryAction === "start" ? (
                <IconRuntimeStart />
              ) : (
                <IconRuntimeRestart />
              )}
              {primaryAction === "start"
                ? t("home.serviceStart")
                : t("home.serviceRestart")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canStop || busy}
            onClick={onStop}
            className="mat-btn text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("home.serviceStop")}
          </button>
        </div>
        {onRuntimeAutostartChange ? (
          <button
            type="button"
            role="switch"
            aria-checked={runtimeAutostart ?? false}
            aria-label={t("home.runtimeAutostart")}
            title={t("home.runtimeAutostart")}
            className="home-runtime-autostart shrink-0 text-[10px] text-foreground-muted hover:text-foreground"
            onClick={() => onRuntimeAutostartChange(!(runtimeAutostart ?? false))}
          >
            {runtimeAutostart
              ? t("home.runtimeAutostartOn")
              : t("home.runtimeAutostartOff")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
