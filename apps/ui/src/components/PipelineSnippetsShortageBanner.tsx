/** Shell banner when train snippets < n_batch × batch_size (orcAI fidelity warn).
 *  Same opt-in as ProjectDataHealthBanner: Settings → «Предупреждения о данных».
 *  Snapshot comes from PipelinePage poll (no second fetch / no 15s lag).
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../preferences/PreferencesContext";
import {
  subscribeSnippetsReadiness,
  type SnippetsReadinessSnapshot,
} from "../lib/pipelineSnippetsReadiness";

export function PipelineSnippetsShortageBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { dataHealthBannerEnabled } = usePreferences();
  const [shortage, setShortage] = useState<SnippetsReadinessSnapshot | null>(
    null,
  );

  const onPipeline =
    pathname === "/pipeline" || pathname.startsWith("/pipeline/");

  useEffect(() => {
    if (!dataHealthBannerEnabled || !onPipeline) {
      setShortage(null);
      return;
    }
    return subscribeSnippetsReadiness((snap) => {
      setShortage(snap?.state === "warn" ? snap : null);
    });
  }, [dataHealthBannerEnabled, onPipeline]);

  if (!dataHealthBannerEnabled || !onPipeline || !shortage) return null;

  const split = shortage.split ?? "train";
  const canClamp =
    shortage.batch_size > 0 &&
    (shortage.actual ?? 0) >= shortage.batch_size;

  return (
    <div
      className="mb-4 shrink-0 rounded border border-amber-500/40 bg-subtle px-4 py-3 text-sm text-foreground-muted"
      role="status"
    >
      <p className="font-medium text-foreground">
        {t("pipeline.snippetsShortageTitle")}
      </p>
      <p className="mt-1.5 leading-snug">
        {t("pipeline.snippetsShortageBody", {
          actual: shortage.actual ?? "—",
          required: shortage.required,
          nBatch: shortage.n_batch,
          batch: shortage.batch_size,
          split,
        })}
      </p>
      <p className="mt-1.5 leading-snug">
        {t(
          canClamp
            ? "pipeline.snippetsShortageDesktopClamp"
            : "pipeline.snippetsShortageDesktopNoClamp",
          { split },
        )}
      </p>
    </div>
  );
}
