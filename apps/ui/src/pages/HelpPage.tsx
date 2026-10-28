import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HELP_TABS, parseHelpTab, type HelpTab } from "../lib/helpManifest";
import { HelpAboutPanel } from "./help/HelpAboutPanel";
import { HelpLicensePanel } from "./help/HelpLicensePanel";
import { HelpManualPanel } from "./help/HelpManualPanel";

const TAB_LABEL: Record<HelpTab, string> = {
  manual: "help.tabManual",
  about: "help.tabAbout",
  license: "help.tabLicense",
};

export function HelpPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = parseHelpTab(params.get("tab"));
  const topic = params.get("topic");

  const subtitle = useMemo(() => {
    if (tab === "manual") return t("help.subtitleManual");
    if (tab === "about") return t("help.subtitleAbout");
    return t("help.subtitleLicense");
  }, [tab, t]);

  return (
    <div className="help-page help-studio">
      <div className="studio-panel help-work-panel">
        <div className="help-page-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.help.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="help-tabs-row predict-tabs-m03" role="tablist" aria-label={t("pages.help.title")}>
          {HELP_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="predict-tab"
              aria-selected={tab === id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (id === "manual") next.delete("tab");
                else next.set("tab", id);
                if (id !== "manual") {
                  next.delete("topic");
                  next.delete("read");
                }
                setParams(next, { replace: true });
              }}
            >
              {t(TAB_LABEL[id])}
            </button>
          ))}
        </div>

        <div className="help-panel-body">
          {tab === "manual" ? (
            <HelpManualPanel topicId={topic} />
          ) : tab === "about" ? (
            <HelpAboutPanel />
          ) : (
            <HelpLicensePanel />
          )}
        </div>
      </div>
    </div>
  );
}
