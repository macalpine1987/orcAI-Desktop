import { useTranslation } from "react-i18next";
import { useSidecarStatus } from "../hooks/useSidecarStatus";

/** Shown on work pages while CPU/GPU restart is in progress (sections stay open). */
export function RuntimeRestartBanner() {
  const { t } = useTranslation();
  const { gracefulRuntimeRestart } = useSidecarStatus();

  if (!gracefulRuntimeRestart) {
    return null;
  }

  return (
    <div
      className="mb-4 shrink-0 rounded border border-amber-500/40 bg-subtle px-4 py-3 text-sm text-foreground-muted"
      role="status"
    >
      {t("app.runtimeRestarting")}
    </div>
  );
}
