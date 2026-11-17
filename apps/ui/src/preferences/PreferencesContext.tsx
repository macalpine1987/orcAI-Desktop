import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWindowChromeSync } from "../hooks/useWindowChromeSync";
import { useTrainMonitorLocaleListener } from "../hooks/useTrainMonitorLocaleListener";
import {
  dockModeFromCollapsed,
  type DefaultDockMode,
} from "../lib/interfaceSettings";
import {
  setLiveLogVerbosity,
  setLiveLargeWavOptimize,
  type LogVerbosity,
} from "../lib/integrationSettings";
import {
  type AppLocale,
} from "../i18n/locale";
import { setAppLocale } from "../i18n";
import { useSaveNotice } from "../ui/saveNotice";
import {
  initPreferencesStore,
  loadStoredPreferences,
  saveStoredPreferences,
  type ComputeDevice,
  type Theme,
  type UiScalePreset,
} from "./storage";
import {
  firstLaunchPatch,
  hydrateFromStored,
} from "./preferencesHydration";
import { usePreferencesControllers } from "./usePreferencesControllers";

export { PREFERENCES_STORAGE_KEY } from "./storage";
export type { AppLocale, DefaultDockMode, Theme, UiScalePreset } from "./storage";
export type { LogVerbosity } from "../lib/integrationSettings";

type Preferences = {
  ready: boolean;
  theme: Theme;
  locale: AppLocale;
  localeManual: boolean;
  computeDevice: ComputeDevice;
  uiScale: UiScalePreset;
  defaultDockCollapsed: boolean;
  defaultDockMode: DefaultDockMode;
  launchFullscreen: boolean;
  /** Advisory shell data-health banner (default off). */
  dataHealthBannerEnabled: boolean;
  runtimeAutostart: boolean;
  logVerbosity: LogVerbosity;
  persistJobLogs: boolean;
  projectsRoot: string;
  spectrogramCacheDir: string;
  jobLogsDir: string;
  largeWavOptimize: boolean;
  /** Analysis spectrogram (default on). */
  showSpectrogram: boolean;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: AppLocale) => void;
  setComputeDevice: (device: ComputeDevice) => void;
  setUiScale: (preset: UiScalePreset) => void;
  setDefaultDockMode: (mode: DefaultDockMode, opts?: { silent?: boolean }) => void;
  setLaunchFullscreen: (enabled: boolean) => void;
  setDataHealthBannerEnabled: (enabled: boolean) => void;
  setRuntimeAutostart: (enabled: boolean) => void;
  setLogVerbosity: (level: LogVerbosity) => void;
  setPersistJobLogs: (enabled: boolean) => void;
  setProjectsRoot: (path: string) => void;
  setSpectrogramCacheDir: (path: string) => void;
  setJobLogsDir: (path: string) => void;
  setLargeWavOptimize: (enabled: boolean) => void;
  setShowSpectrogram: (enabled: boolean) => void;
  resetToFactoryDefaults: () => Promise<void>;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { notifySaved } = useSaveNotice();
  const [ready, setReady] = useState(false);
  const boot = hydrateFromStored(loadStoredPreferences());

  const [theme, setThemeState] = useState<Theme>(boot.theme);
  const [locale, setLocaleState] = useState<AppLocale>(boot.initial.locale);
  const [localeManual, setLocaleManualState] = useState(
    boot.initial.localeManual,
  );
  const [computeDevice, setComputeDeviceState] = useState<ComputeDevice>(
    boot.computeDevice,
  );
  const [uiScale, setUiScaleState] = useState<UiScalePreset>(boot.uiScale);
  const [defaultDockCollapsed, setDefaultDockCollapsedState] = useState(
    boot.defaultDockCollapsed,
  );
  const [launchFullscreen, setLaunchFullscreenState] = useState(
    boot.launchFullscreen,
  );
  const [dataHealthBannerEnabled, setDataHealthBannerEnabledState] = useState(
    boot.dataHealthBannerEnabled,
  );
  const [runtimeAutostart, setRuntimeAutostartState] = useState(
    boot.runtimeAutostart,
  );
  const [logVerbosity, setLogVerbosityState] = useState(() => {
    setLiveLogVerbosity(boot.logVerbosity);
    setLiveLargeWavOptimize(boot.largeWavOptimize);
    return boot.logVerbosity;
  });
  const [persistJobLogs, setPersistJobLogsState] = useState(boot.persistJobLogs);
  const [projectsRoot, setProjectsRootState] = useState(boot.projectsRoot);
  const [spectrogramCacheDir, setSpectrogramCacheDirState] = useState(
    boot.spectrogramCacheDir,
  );
  const [jobLogsDir, setJobLogsDirState] = useState(boot.jobLogsDir);
  const [largeWavOptimize, setLargeWavOptimizeState] = useState(
    boot.largeWavOptimize,
  );
  const [showSpectrogram, setShowSpectrogramState] = useState(
    boot.showSpectrogram,
  );

  useWindowChromeSync(uiScale, launchFullscreen);
  useTrainMonitorLocaleListener(setLocaleState, setLocaleManualState);

  useEffect(() => {
    let cancelled = false;
    void initPreferencesStore().then((stored) => {
      if (cancelled) return;
      const h = hydrateFromStored(stored);
      setThemeState(h.theme);
      setLocaleState(h.initial.locale);
      setLocaleManualState(h.initial.localeManual);
      setComputeDeviceState(h.computeDevice);
      setUiScaleState(h.uiScale);
      setDefaultDockCollapsedState(h.defaultDockCollapsed);
      setLaunchFullscreenState(h.launchFullscreen);
      setDataHealthBannerEnabledState(h.dataHealthBannerEnabled);
      setRuntimeAutostartState(h.runtimeAutostart);
      setLogVerbosityState(h.logVerbosity);
      setPersistJobLogsState(h.persistJobLogs);
      setProjectsRootState(h.projectsRoot);
      setSpectrogramCacheDirState(h.spectrogramCacheDir);
      setJobLogsDirState(h.jobLogsDir);
      setLargeWavOptimizeState(h.largeWavOptimize);
      setShowSpectrogramState(h.showSpectrogram);
      setLiveLogVerbosity(h.logVerbosity);
      setLiveLargeWavOptimize(h.largeWavOptimize);
      setReady(true);
      const patch = firstLaunchPatch(stored, h);
      if (Object.keys(patch).length > 0) {
        void saveStoredPreferences(patch);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const controllers = usePreferencesControllers({
    notifySaved,
    showSpectrogram,
    setThemeState,
    setLocaleState,
    setLocaleManualState,
    setComputeDeviceState,
    setUiScaleState,
    setDefaultDockCollapsedState,
    setLaunchFullscreenState,
    setDataHealthBannerEnabledState,
    setRuntimeAutostartState,
    setLogVerbosityState,
    setPersistJobLogsState,
    setProjectsRootState,
    setSpectrogramCacheDirState,
    setJobLogsDirState,
    setLargeWavOptimizeState,
    setShowSpectrogramState,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.layout = "lab";
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    void setAppLocale(locale, { manual: localeManual });
  }, [ready, locale, localeManual]);

  const value = useMemo(
    () => ({
      ready,
      theme,
      locale,
      localeManual,
      computeDevice,
      uiScale,
      defaultDockCollapsed,
      defaultDockMode: dockModeFromCollapsed(defaultDockCollapsed),
      launchFullscreen,
      dataHealthBannerEnabled,
      runtimeAutostart,
      logVerbosity,
      persistJobLogs,
      projectsRoot,
      spectrogramCacheDir,
      jobLogsDir,
      largeWavOptimize,
      showSpectrogram,
      ...controllers,
    }),
    [
      ready,
      theme,
      locale,
      localeManual,
      computeDevice,
      uiScale,
      defaultDockCollapsed,
      launchFullscreen,
      dataHealthBannerEnabled,
      runtimeAutostart,
      logVerbosity,
      persistJobLogs,
      projectsRoot,
      spectrogramCacheDir,
      jobLogsDir,
      largeWavOptimize,
      showSpectrogram,
      controllers,
    ],
  );

  if (!ready) {
    return (
      <div data-theme={theme} data-layout="lab" className="app-shell-root" />
    );
  }

  return (
    <PreferencesContext.Provider value={value}>
      <div data-theme={theme} data-layout="lab">
        {children}
      </div>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}
