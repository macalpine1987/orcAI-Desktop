import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHelpButton } from "../components/PageHelpButton";
import { SettingsInterfacePanel } from "./settings/SettingsInterfacePanel";
import { SettingsRuntimePanel } from "./settings/SettingsRuntimePanel";

type SettingsTab = "runtime" | "interface";

const TABS: { id: SettingsTab; labelKey: string }[] = [
  { id: "runtime", labelKey: "settings.tabRuntime" },
  { id: "interface", labelKey: "settings.tabInterface" },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("runtime");

  return (
    <div className="settings-page m28-settings-studio">
      <div className="studio-panel settings-work-panel">
        <div className="settings-page-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground">
                {t("settings.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                {t("settings.subtitle")}
              </p>
            </div>
            <PageHelpButton topic="gear" hint={t("help.hint.settings")} />
          </div>
        </div>

        <div
          className="settings-tabs-row predict-tabs-m03"
          role="tablist"
          aria-label={t("settings.title")}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="predict-tab"
              aria-selected={activeTab === tab.id}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="settings-panel-body">
          {activeTab === "interface" ? (
            <SettingsInterfacePanel />
          ) : (
            <SettingsRuntimePanel />
          )}
        </div>
      </div>
    </div>
  );
}
