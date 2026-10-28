import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import { usePreferences } from "../../preferences/PreferencesContext";
import type { ComputeDevice } from "../../preferences/storage";
import { SettingsPathsPanel } from "./SettingsPathsPanel";
import { SettingsRow } from "./SettingsRow";

export function SettingsRuntimePanel() {
  const { t } = useTranslation();
  const {
    computeDevice,
    setComputeDevice,
    runtimeAutostart,
    setRuntimeAutostart,
    largeWavOptimize,
    setLargeWavOptimize,
    showSpectrogram,
    setShowSpectrogram,
  } = usePreferences();
  const {
    online,
    enginePhase,
    restartRuntimeForComputeDevice,
  } = useSidecarStatus();

  const onComputeDeviceChange = useCallback(
    async (device: ComputeDevice) => {
      if (device === computeDevice) return;
      const active =
        online ||
        enginePhase === "running" ||
        enginePhase === "starting" ||
        enginePhase === "stopping";
      if (active) {
        const previous = computeDevice;
        // Persist intent immediately so the control and any mid-restart
        // engine starts agree on the target device (rollback on failure).
        setComputeDevice(device);
        try {
          await restartRuntimeForComputeDevice(device);
        } catch {
          setComputeDevice(previous);
        }
        return;
      }
      setComputeDevice(device);
    },
    [
      computeDevice,
      enginePhase,
      online,
      restartRuntimeForComputeDevice,
      setComputeDevice,
    ],
  );

  return (
    <div className="settings-runtime-grid">
      <section className="settings-studio-card" aria-labelledby="settings-runtime-engine">
        <h2 id="settings-runtime-engine" className="settings-studio-card-title">
          {t("settings.runtimeEngineTitle")}
        </h2>
        <div className="settings-studio-card-body">
          <SettingsRow
            title={t("settings.runtimeAutostart")}
            hint={t("settings.runtimeAutostartHint")}
          >
            <ToggleSwitch
              label={t("settings.runtimeAutostart")}
              checked={runtimeAutostart}
              onChange={setRuntimeAutostart}
            />
          </SettingsRow>

          <div
            className="settings-studio-inset"
            role="group"
            aria-labelledby="settings-analysis-display"
          >
            <h3
              id="settings-analysis-display"
              className="settings-studio-inset-title"
            >
              {t("settings.analysisDisplayTitle")}
            </h3>
            <SettingsRow
              title={t("settings.showSpectrogram")}
              hint={t("settings.showSpectrogramHint")}
            >
              <ToggleSwitch
                label={t("settings.showSpectrogram")}
                checked={showSpectrogram}
                onChange={setShowSpectrogram}
              />
            </SettingsRow>
            <SettingsRow
              title={t("settings.largeWavOptimize")}
              hint={
                showSpectrogram
                  ? t("settings.largeWavOptimizeHint")
                  : t("settings.largeWavOptimizeDisabledHint")
              }
            >
              <ToggleSwitch
                label={t("settings.largeWavOptimize")}
                checked={showSpectrogram && largeWavOptimize}
                disabled={!showSpectrogram}
                onChange={setLargeWavOptimize}
              />
            </SettingsRow>
          </div>

          <SettingsRow title={t("settings.compute")} hint={t("settings.computeHint")}>
            <SegmentedControl<ComputeDevice>
              aria-label={t("settings.compute")}
              value={computeDevice}
              options={[
                { value: "cpu", label: t("settings.computeCpu") },
                { value: "gpu", label: t("settings.computeGpu") },
              ]}
              onChange={(d) => void onComputeDeviceChange(d)}
            />
          </SettingsRow>
        </div>
      </section>

      <SettingsPathsPanel />
    </div>
  );
}
