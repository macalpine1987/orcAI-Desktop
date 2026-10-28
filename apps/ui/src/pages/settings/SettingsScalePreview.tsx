import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { UiScalePreset } from "../../lib/interfaceSettings";
import type { DefaultDockMode, Theme } from "../../preferences/PreferencesContext";
import {
  computeScalePreviewMetrics,
  SCALE_PREVIEW_LOGICAL_HEIGHT,
  SCALE_PREVIEW_LOGICAL_WIDTH,
  SCALE_PREVIEW_NAV_IDS,
} from "./scalePreviewMetrics";

type Props = {
  preset: UiScalePreset;
  theme: Theme;
  dockMode: DefaultDockMode;
  dataHealthBannerEnabled?: boolean;
};

export function SettingsScalePreview({
  preset,
  theme,
  dockMode,
  dataHealthBannerEnabled = false,
}: Props) {
  const { t } = useTranslation();
  const metrics = computeScalePreviewMetrics(preset, dockMode);

  return (
    <aside
      className="settings-scale-preview"
      aria-label={t("settings.scalePreview")}
      data-preview-theme={theme}
    >
      <div className="settings-scale-preview-title">
        {t("settings.scalePreview")}
      </div>

      <dl className="settings-scale-preview-metrics">
        <div className="settings-scale-preview-metric">
          <dt>{t("settings.scalePreviewMetricCanvas")}</dt>
          <dd>
            {t("settings.scalePreviewMeta", {
              width: SCALE_PREVIEW_LOGICAL_WIDTH,
              height: SCALE_PREVIEW_LOGICAL_HEIGHT,
              pct: metrics.pct,
            })}
          </dd>
        </div>
        <div className="settings-scale-preview-metric">
          <dt>{t("settings.scalePreviewMetricEffective")}</dt>
          <dd>
            {t("settings.scalePreviewMetricEffectiveValue", {
              width: metrics.effectiveWidth,
              height: metrics.effectiveHeight,
            })}
          </dd>
        </div>
        <div className="settings-scale-preview-metric">
          <dt>{t("settings.scalePreviewMetricSidebar")}</dt>
          <dd>{t("settings.scalePreviewMetricPx", { px: metrics.sidebarPx })}</dd>
        </div>
        <div className="settings-scale-preview-metric">
          <dt>{t("settings.scalePreviewMetricDock")}</dt>
          <dd>
            {metrics.dockCollapsed
              ? t("settings.defaultDockCollapsed")
              : t("settings.defaultDockExpanded")}
            {" · "}
            {t("settings.scalePreviewMetricPx", { px: metrics.dockHeightPx })}
          </dd>
        </div>
        <div className="settings-scale-preview-metric">
          <dt>{t("settings.dataHealthBanner")}</dt>
          <dd>
            {dataHealthBannerEnabled
              ? t("settings.dataHealthBannerOn")
              : t("settings.dataHealthBannerOff")}
          </dd>
        </div>
      </dl>

      <div className="settings-scale-preview-viewport">
        <div
          className="settings-scale-preview-scene"
          style={
            metrics.factor === 1 ? undefined : { zoom: metrics.factor }
          }
        >
          <div
            className="settings-scale-preview-frame"
            data-theme={theme}
          >
            <nav
              className="settings-scale-preview-sidebar"
              aria-hidden
            >
              {SCALE_PREVIEW_NAV_IDS.map((id) => (
                <div
                  key={id}
                  className={clsx(
                    "settings-scale-preview-nav-item",
                    id === "jobs" && "settings-scale-preview-nav-item--active",
                  )}
                >
                  <span>{t(`nav.${id}`)}</span>
                </div>
              ))}
            </nav>

            <div className="settings-scale-preview-shell">
              <div className="settings-scale-preview-header">
                <span className="settings-scale-preview-brand-bar" />
                <div className="settings-scale-preview-meta-frames">
                  <span className="settings-scale-preview-meta-frame" />
                  <span className="settings-scale-preview-meta-frame" />
                  <span className="settings-scale-preview-meta-frame settings-scale-preview-meta-frame--engine" />
                </div>
              </div>

              <div className="settings-scale-preview-work-panel">
                <div className="settings-scale-preview-page-title-bar">
                  <span className="settings-scale-preview-page-title" />
                  <span className="settings-scale-preview-page-subtitle" />
                </div>
                <div className="settings-scale-preview-tabs">
                  <span className="settings-scale-preview-tab" />
                  <span className="settings-scale-preview-tab settings-scale-preview-tab--active" />
                  <span className="settings-scale-preview-tab" />
                </div>
                <div className="settings-scale-preview-toolbar">
                  <span className="settings-scale-preview-toolbar-chip" />
                  <span className="settings-scale-preview-toolbar-chip" />
                  <span className="settings-scale-preview-toolbar-chip settings-scale-preview-toolbar-chip--ghost" />
                </div>
                <div className="settings-scale-preview-table">
                  <div className="settings-scale-preview-table-head">
                    <span /><span /><span /><span />
                  </div>
                  <div className="settings-scale-preview-table-body">
                    <div className="settings-scale-preview-table-row" />
                    <div className="settings-scale-preview-table-row" />
                    <div className="settings-scale-preview-table-row" />
                    <div className="settings-scale-preview-table-row" />
                  </div>
                </div>
              </div>

              <div
                className={clsx(
                  "settings-scale-preview-dock",
                  metrics.dockCollapsed
                    ? "settings-scale-preview-dock--collapsed"
                    : "settings-scale-preview-dock--expanded",
                )}
              >
                {metrics.dockCollapsed ? (
                  <span className="settings-scale-preview-dock-strip-label" />
                ) : (
                  <>
                    <div className="settings-scale-preview-dock-tabs">
                      <span className="settings-scale-preview-dock-tab settings-scale-preview-dock-tab--active" />
                      <span className="settings-scale-preview-dock-tab" />
                      <span className="settings-scale-preview-dock-tab" />
                    </div>
                    <div className="settings-scale-preview-dock-well" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="settings-scale-preview-caption">
        {t("settings.scalePreviewCaption")}
      </p>
    </aside>
  );
}
