import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { uiSetScale, windowSetFullscreen } from "../platform/windowChrome";
import {
  defaultDockCollapsed as dockCollapsedFromMode,
  type DefaultDockMode,
} from "../lib/interfaceSettings";
import {
  setLiveLogVerbosity,
  setLiveLargeWavOptimize,
  type LogVerbosity,
} from "../lib/integrationSettings";
import { savePredictSettings } from "../workspace/predictSettings";
import {
  type AppLocale,
  persistLocalePreference,
} from "../i18n/locale";
import { setAppLocale } from "../i18n";
import {
  DEFAULT_COMPUTE_DEVICE,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  eraseStoredPreferences,
  saveStoredPreferences,
  type ComputeDevice,
  type Theme,
  type UiScalePreset,
} from "./storage";
import { hydrateFromStored } from "./preferencesHydration";

type ControllersArgs = {
  notifySaved: (message?: string) => void;
  showSpectrogram: boolean;
  setThemeState: Dispatch<SetStateAction<Theme>>;
  setLocaleState: Dispatch<SetStateAction<AppLocale>>;
  setLocaleManualState: Dispatch<SetStateAction<boolean>>;
  setComputeDeviceState: Dispatch<SetStateAction<ComputeDevice>>;
  setUiScaleState: Dispatch<SetStateAction<UiScalePreset>>;
  setDefaultDockCollapsedState: Dispatch<SetStateAction<boolean>>;
  setLaunchFullscreenState: Dispatch<SetStateAction<boolean>>;
  setDataHealthBannerEnabledState: Dispatch<SetStateAction<boolean>>;
  setRuntimeAutostartState: Dispatch<SetStateAction<boolean>>;
  setLogVerbosityState: Dispatch<SetStateAction<LogVerbosity>>;
  setPersistJobLogsState: Dispatch<SetStateAction<boolean>>;
  setProjectsRootState: Dispatch<SetStateAction<string>>;
  setSpectrogramCacheDirState: Dispatch<SetStateAction<string>>;
  setJobLogsDirState: Dispatch<SetStateAction<string>>;
  setLargeWavOptimizeState: Dispatch<SetStateAction<boolean>>;
  setShowSpectrogramState: Dispatch<SetStateAction<boolean>>;
};

/** Preference mutators + factory reset (extracted from PreferencesProvider). */
export function usePreferencesControllers(args: ControllersArgs) {
  const { t } = useTranslation();
  const {
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
  } = args;

  const setTheme = useCallback(
    (_t: Theme) => {
      setThemeState(DEFAULT_THEME);
      void saveStoredPreferences({ theme: DEFAULT_THEME }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setThemeState],
  );

  const setDataHealthBannerEnabled = useCallback(
    (enabled: boolean) => {
      setDataHealthBannerEnabledState(enabled);
      void saveStoredPreferences({ dataHealthBannerEnabled: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setDataHealthBannerEnabledState],
  );

  const setComputeDevice = useCallback(
    (device: ComputeDevice) => {
      setComputeDeviceState(device);
      void saveStoredPreferences({ computeDevice: device }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setComputeDeviceState],
  );

  const setLocale = useCallback(
    (next: AppLocale) => {
      setLocaleState(next);
      setLocaleManualState(true);
      void persistLocalePreference(next, true);
      void setAppLocale(next, { manual: true });
      notifySaved();
    },
    [notifySaved, setLocaleManualState, setLocaleState],
  );

  const setUiScale = useCallback(
    (preset: UiScalePreset) => {
      setUiScaleState(preset);
      void saveStoredPreferences({ uiScale: preset }).then(() => notifySaved());
    },
    [notifySaved, setUiScaleState],
  );

  const setDefaultDockMode = useCallback(
    (mode: DefaultDockMode, opts?: { silent?: boolean }) => {
      const collapsed = dockCollapsedFromMode(mode);
      setDefaultDockCollapsedState(collapsed);
      void saveStoredPreferences({ defaultDockCollapsed: collapsed }).then(() => {
        // Live console collapse must not toast — only Settings UI should notify.
        if (!opts?.silent) notifySaved();
      });
    },
    [notifySaved, setDefaultDockCollapsedState],
  );

  const setLaunchFullscreen = useCallback(
    (enabled: boolean) => {
      setLaunchFullscreenState(enabled);
      void saveStoredPreferences({ launchFullscreen: enabled }).then(() =>
        notifySaved(),
      );
      void windowSetFullscreen(enabled);
    },
    [notifySaved, setLaunchFullscreenState],
  );

  const setRuntimeAutostart = useCallback(
    (enabled: boolean) => {
      setRuntimeAutostartState(enabled);
      void saveStoredPreferences({ runtimeAutostart: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setRuntimeAutostartState],
  );

  const setLogVerbosity = useCallback(
    (level: LogVerbosity) => {
      setLogVerbosityState(level);
      setLiveLogVerbosity(level);
      savePredictSettings({ verbosity: level });
      void saveStoredPreferences({ logVerbosity: level }).then(() => notifySaved());
    },
    [notifySaved, setLogVerbosityState],
  );

  const setPersistJobLogs = useCallback(
    (enabled: boolean) => {
      setPersistJobLogsState(enabled);
      void saveStoredPreferences({ persistJobLogs: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setPersistJobLogsState],
  );

  const setProjectsRoot = useCallback(
    (path: string) => {
      setProjectsRootState(path);
      void saveStoredPreferences({ projectsRoot: path }).then(() => notifySaved());
    },
    [notifySaved, setProjectsRootState],
  );

  const setSpectrogramCacheDir = useCallback(
    (path: string) => {
      setSpectrogramCacheDirState(path);
      void saveStoredPreferences({ spectrogramCacheDir: path }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setSpectrogramCacheDirState],
  );

  const setJobLogsDir = useCallback(
    (path: string) => {
      setJobLogsDirState(path);
      void saveStoredPreferences({ jobLogsDir: path }).then(() => notifySaved());
    },
    [notifySaved, setJobLogsDirState],
  );

  const setLargeWavOptimize = useCallback(
    (enabled: boolean) => {
      // No spectrogram tiles in table-hero — ignore enable requests.
      if (enabled && !showSpectrogram) return;
      setLargeWavOptimizeState(enabled);
      setLiveLargeWavOptimize(enabled);
      void saveStoredPreferences({ largeWavOptimize: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setLargeWavOptimizeState, showSpectrogram],
  );

  const setShowSpectrogram = useCallback(
    (enabled: boolean) => {
      setShowSpectrogramState(enabled);
      // Long-WAV optimize only applies to spectrogram tiles — force off with table-hero.
      if (!enabled) {
        setLargeWavOptimizeState(false);
        setLiveLargeWavOptimize(false);
        void saveStoredPreferences({
          showSpectrogram: false,
          largeWavOptimize: false,
        }).then(() => notifySaved());
        return;
      }
      void saveStoredPreferences({ showSpectrogram: true }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved, setLargeWavOptimizeState, setShowSpectrogramState],
  );

  const resetToFactoryDefaults = useCallback(async () => {
    const stored = await eraseStoredPreferences();
    const h = hydrateFromStored(stored);
    const theme = DEFAULT_THEME;
    setThemeState(theme);
    document.documentElement.dataset.theme = theme;
    setLocaleState(h.initial.locale);
    setLocaleManualState(false);
    setComputeDeviceState(DEFAULT_COMPUTE_DEVICE);
    setUiScaleState(h.uiScale);
    setDefaultDockCollapsedState(h.defaultDockCollapsed);
    setLaunchFullscreenState(false);
    setDataHealthBannerEnabledState(false);
    setRuntimeAutostartState(false);
    setLogVerbosityState(h.logVerbosity);
    setPersistJobLogsState(true);
    setProjectsRootState("");
    setSpectrogramCacheDirState("");
    setJobLogsDirState("");
    setLargeWavOptimizeState(false);
    setShowSpectrogramState(true);
    setLiveLogVerbosity(h.logVerbosity);
    setLiveLargeWavOptimize(false);
    await setAppLocale(DEFAULT_LOCALE, { manual: false });
    await saveStoredPreferences({
      theme,
      dataHealthBannerEnabled: false,
      locale: DEFAULT_LOCALE,
      localeManual: false,
      computeDevice: DEFAULT_COMPUTE_DEVICE,
    });
    try {
      await windowSetFullscreen(false);
    } catch {
      /* ACL is granted by allow-window-chrome; ignore until shell rebuild. */
    }
    try {
      await uiSetScale(1.0);
    } catch {
      /* same */
    }
    notifySaved(t("settings.resetDone"));
  }, [
    notifySaved,
    t,
    setComputeDeviceState,
    setDataHealthBannerEnabledState,
    setDefaultDockCollapsedState,
    setJobLogsDirState,
    setLargeWavOptimizeState,
    setLaunchFullscreenState,
    setLocaleManualState,
    setLocaleState,
    setLogVerbosityState,
    setPersistJobLogsState,
    setProjectsRootState,
    setRuntimeAutostartState,
    setShowSpectrogramState,
    setSpectrogramCacheDirState,
    setThemeState,
    setUiScaleState,
  ]);

  return {
    setTheme,
    setLocale,
    setComputeDevice,
    setUiScale,
    setDefaultDockMode,
    setLaunchFullscreen,
    setDataHealthBannerEnabled,
    setRuntimeAutostart,
    setLogVerbosity,
    setPersistJobLogs,
    setProjectsRoot,
    setSpectrogramCacheDir,
    setJobLogsDir,
    setLargeWavOptimize,
    setShowSpectrogram,
    resetToFactoryDefaults,
  };
}
