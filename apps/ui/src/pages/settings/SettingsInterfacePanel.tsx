import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import {
  usePreferences,
  type AppLocale,
  type DefaultDockMode,
  type UiScalePreset,
} from "../../preferences/PreferencesContext";
import { SettingsRow } from "./SettingsRow";
import { SettingsScalePreview } from "./SettingsScalePreview";

export function SettingsInterfacePanel() {
  const { t } = useTranslation();
  const {
    locale,
    setLocale,
    uiScale,
    setUiScale,
    defaultDockMode,
    setDefaultDockMode,
    launchFullscreen,
    setLaunchFullscreen,
    dataHealthBannerEnabled,
    setDataHealthBannerEnabled,
  } = usePreferences();

  return (
    <div className="settings-interface-layout">
      <div className="settings-interface-fields">
        <SettingsRow title={t("settings.language")} hint={t("settings.languageChoiceHint")}>
          <SegmentedControl<AppLocale>
            aria-label={t("settings.language")}
            value={locale}
            options={[
              { value: "ru", label: t("settings.localeRuShort") },
              { value: "en", label: t("settings.localeEnShort") },
            ]}
            onChange={setLocale}
          />
        </SettingsRow>

        <SettingsRow
          title={t("settings.dataHealthBanner")}
          hint={t("settings.dataHealthBannerHint")}
        >
          <ToggleSwitch
            label={t("settings.dataHealthBanner")}
            checked={dataHealthBannerEnabled}
            onChange={setDataHealthBannerEnabled}
          />
        </SettingsRow>

        <SettingsRow title={t("settings.uiScale")}>
          <SegmentedControl<UiScalePreset>
            aria-label={t("settings.uiScale")}
            value={uiScale}
            options={[
              { value: "100", label: "100%" },
              { value: "125", label: "125%" },
            ]}
            onChange={setUiScale}
          />
        </SettingsRow>

        <SettingsRow
          title={t("settings.fullscreen")}
          hint={t("settings.fullscreenHint")}
        >
          <ToggleSwitch
            label={t("settings.fullscreen")}
            checked={launchFullscreen}
            onChange={setLaunchFullscreen}
          />
        </SettingsRow>

        <SettingsRow
          title={t("settings.defaultDock")}
          hint={t("settings.defaultDockHint")}
        >
          <select
            className="settings-select"
            aria-label={t("settings.defaultDock")}
            value={defaultDockMode}
            onChange={(e) =>
              setDefaultDockMode(e.target.value as DefaultDockMode)
            }
          >
            <option value="collapsed">{t("settings.defaultDockCollapsed")}</option>
            <option value="expanded">{t("settings.defaultDockExpanded")}</option>
          </select>
        </SettingsRow>
      </div>

      <SettingsScalePreview
        preset={uiScale}
        theme="dark"
        dockMode={defaultDockMode}
        dataHealthBannerEnabled={dataHealthBannerEnabled}
      />
    </div>
  );
}
