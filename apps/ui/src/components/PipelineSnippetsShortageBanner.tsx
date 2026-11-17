/** Shell tip when train snippets < n_batch × batch_size (orcAI fidelity warn).
 *  Same opt-in as ProjectDataHealthBanner: Settings → «Отображать советы».
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
import { useSaveNotice } from "../ui/saveNotice";

export function PipelineSnippetsShortageBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { dataHealthBannerEnabled } = usePreferences();
  const { setHeaderTip } = useSaveNotice();
  const [shortage, setShortage] = useState<SnippetsReadinessSnapshot | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  const onPipeline =
    pathname === "/pipeline" || pathname.startsWith("/pipeline/");

  useEffect(() => {
    setDismissed(false);
  }, [pathname]);

  useEffect(() => {
    if (!dataHealthBannerEnabled || !onPipeline) {
      setShortage(null);
      return;
    }
    return subscribeSnippetsReadiness((snap) => {
      setShortage(snap?.state === "warn" ? snap : null);
    });
  }, [dataHealthBannerEnabled, onPipeline]);

  useEffect(() => {
    if (!dataHealthBannerEnabled || !onPipeline || !shortage || dismissed) {
      setHeaderTip("snippets", null);
      return;
    }
    const split = shortage.split ?? "train";
    setHeaderTip("snippets", {
      message: t("pipeline.snippetsShortageHeaderTip", {
        actual: shortage.actual ?? "—",
        required: shortage.required,
        split,
      }),
      onDismiss: () => setDismissed(true),
    });
    return () => {
      setHeaderTip("snippets", null);
    };
  }, [
    dataHealthBannerEnabled,
    dismissed,
    onPipeline,
    setHeaderTip,
    shortage,
    t,
  ]);

  return null;
}
