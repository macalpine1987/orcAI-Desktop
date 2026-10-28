import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWindowChromeSync } from "../hooks/useWindowChromeSync";
import { uiSetScale, windowSetFullscreen } from "../platform/windowChrome";
import { setAppLocale } from "../i18n";
import {
  defaultDockCollapsed as dockCollapsedFromMode,
  dockModeFromCollapsed,
  type DefaultDockMode,
} from "../lib/interfaceSettings";
import {
  resolveLogVerbosity,
  setLiveLogVerbosity,
  setLiveLargeWavOptimize,
  type LogVerbosity,
} from "../lib/integrationSettings";
import { savePredictSettings } from "../workspace/predictSettings";
import {
  type AppLocale,
  persistLocalePreference,
  resolveInitialLocale,
} from "../i18n/locale";
import { useSaveNotice } from "../ui/saveNotice";
import {
  initPreferencesStore,
  DEFAULT_COMPUTE_DEVICE,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  loadStoredPreferences,
  eraseStoredPreferences,
  resolveComputeDevice,
  resolveDataHealthBannerEnabled,
  resolveLargeWavOptimize,
  resolveShowSpectrogram,
  resolveTheme,
  resolveUiScalePreset,
  saveStoredPreferences,
  type ComputeDevice,
  type StoredPreferences,
  type Theme,
  type UiScalePreset,
} from "./storage";

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

function readInterfaceDefaults(stored: StoredPreferences) {
  return {
    uiScale: resolveUiScalePreset(stored),
    defaultDockCollapsed: stored.defaultDockCollapsed ?? true,
    launchFullscreen: stored.launchFullscreen ?? false,
    dataHealthBannerEnabled: resolveDataHealthBannerEnabled(stored),
    runtimeAutostart: stored.runtimeAutostart ?? false,
    logVerbosity: resolveLogVerbosity(stored.logVerbosity),
    persistJobLogs: stored.persistJobLogs ?? true,
    projectsRoot: stored.projectsRoot ?? "",
    spectrogramCacheDir: stored.spectrogramCacheDir ?? "",
    jobLogsDir: stored.jobLogsDir ?? "",
    largeWavOptimize: resolveLargeWavOptimize(stored),
    showSpectrogram: resolveShowSpectrogram(stored),
  };
}

function hydrateFromStored(stored: StoredPreferences) {
  const initial = resolveInitialLocale();
  const iface = readInterfaceDefaults(stored);
  return {
    initial,
    theme: resolveTheme(stored),
    computeDevice: resolveComputeDevice(stored),
    ...iface,
  };
}

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
      const firstLaunchPatch: Partial<StoredPreferences> = {};
      if (stored.computeDevice === undefined) {
        firstLaunchPatch.computeDevice = DEFAULT_COMPUTE_DEVICE;
      }
      if (stored.locale === undefined) {
        firstLaunchPatch.locale = DEFAULT_LOCALE;
        firstLaunchPatch.localeManual = false;
      }
      // Dark-only: coerce legacy light / missing theme.
      if (stored.theme !== DEFAULT_THEME) {
        firstLaunchPatch.theme = DEFAULT_THEME;
      }
      if (stored.dataHealthBannerEnabled === undefined) {
        firstLaunchPatch.dataHealthBannerEnabled = false;
      }
      // Coerce stale long-WAV flag when Analysis is table-hero on disk.
      if (
        !h.showSpectrogram &&
        stored.largeWavOptimize === true
      ) {
        firstLaunchPatch.largeWavOptimize = false;
      }
      if (Object.keys(firstLaunchPatch).length > 0) {
        void saveStoredPreferences(firstLaunchPatch);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback(
    (_t: Theme) => {
      setThemeState(DEFAULT_THEME);
      void saveStoredPreferences({ theme: DEFAULT_THEME }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setDataHealthBannerEnabled = useCallback(
    (enabled: boolean) => {
      setDataHealthBannerEnabledState(enabled);
      void saveStoredPreferences({ dataHealthBannerEnabled: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setComputeDevice = useCallback(
    (device: ComputeDevice) => {
      setComputeDeviceState(device);
      void saveStoredPreferences({ computeDevice: device }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setLocale = useCallback(
    (next: AppLocale) => {
      setLocaleState(next);
      setLocaleManualState(true);
      void persistLocalePreference(next, true);
      void setAppLocale(next, { manual: true });
      notifySaved();
    },
    [notifySaved],
  );

  const setUiScale = useCallback(
    (preset: UiScalePreset) => {
      setUiScaleState(preset);
      void saveStoredPreferences({ uiScale: preset }).then(() => notifySaved());
    },
    [notifySaved],
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
    [notifySaved],
  );

  const setLaunchFullscreen = useCallback(
    (enabled: boolean) => {
      setLaunchFullscreenState(enabled);
      void saveStoredPreferences({ launchFullscreen: enabled }).then(() =>
        notifySaved(),
      );
      void windowSetFullscreen(enabled);
    },
    [notifySaved],
  );

  const setRuntimeAutostart = useCallback(
    (enabled: boolean) => {
      setRuntimeAutostartState(enabled);
      void saveStoredPreferences({ runtimeAutostart: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setLogVerbosity = useCallback(
    (level: LogVerbosity) => {
      setLogVerbosityState(level);
      setLiveLogVerbosity(level);
      savePredictSettings({ verbosity: level });
      void saveStoredPreferences({ logVerbosity: level }).then(() => notifySaved());
    },
    [notifySaved],
  );

  const setPersistJobLogs = useCallback(
    (enabled: boolean) => {
      setPersistJobLogsState(enabled);
      void saveStoredPreferences({ persistJobLogs: enabled }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setProjectsRoot = useCallback(
    (path: string) => {
      setProjectsRootState(path);
      void saveStoredPreferences({ projectsRoot: path }).then(() => notifySaved());
    },
    [notifySaved],
  );

  const setSpectrogramCacheDir = useCallback(
    (path: string) => {
      setSpectrogramCacheDirState(path);
      void saveStoredPreferences({ spectrogramCacheDir: path }).then(() =>
        notifySaved(),
      );
    },
    [notifySaved],
  );

  const setJobLogsDir = useCallback(
    (path: string) => {
      setJobLogsDirState(path);
      void saveStoredPreferences({ jobLogsDir: path }).then(() => notifySaved());
    },
    [notifySaved],
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
    [notifySaved, showSpectrogram],
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
    [notifySaved],
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
    notifySaved();
  }, [notifySaved]);

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
