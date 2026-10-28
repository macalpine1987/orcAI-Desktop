import { Outlet, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSectionsAccessible } from "../hooks/useAppAccess";
import { isRuntimeFreePath } from "../lib/appAccess";
import { useSidecarStatus } from "../hooks/useSidecarStatus";

function WorkSectionsBlocked({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation();
  const { online, runtimeStatusKey } = useSidecarStatus();

  const statusMessage = !online
    ? t("predict.sidecarRequired")
    : t(runtimeStatusKey, {
        defaultValue: t("projects.engineRequired"),
      });

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded border border-amber-500/40 bg-subtle px-4 py-4">
        <p className="text-sm font-medium text-foreground">
          {t("app.runtimeBlockedTitle")}
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          {t("app.runtimeBlockedBody")}
        </p>
        <p className="mt-3 font-mono text-xs text-foreground-muted">{statusMessage}</p>
      </div>
      <Link
        to="/"
        state={{ returnTo }}
        className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        {t("app.goToHomeRuntime")}
      </Link>
    </div>
  );
}

/** Blocks work section routes until sidecar + engine are ready (with CPU/GPU restart grace). */
export function RuntimeRouteGuard() {
  const { pathname, search } = useLocation();
  const accessible = useSectionsAccessible();

  if (!isRuntimeFreePath(pathname) && !accessible) {
    return <WorkSectionsBlocked returnTo={pathname + search} />;
  }

  // FR-2.17: project kind does not lock routes. Recognition focus
  // leaves Training via PipelinePage (pipelineNavInactive), not this guard.
  return <Outlet />;
}
