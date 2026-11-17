/**
 * Hydrate / first-launch patch helpers for PreferencesProvider.
 * Keeps storage + locale resolution out of the context file body.
 */

import {
  resolveLogVerbosity,
  type LogVerbosity,
} from "../lib/integrationSettings";
import {
  resolveInitialLocale,
  type AppLocale,
} from "../i18n/locale";
import {
  DEFAULT_COMPUTE_DEVICE,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  resolveComputeDevice,
  resolveDataHealthBannerEnabled,
  resolveLargeWavOptimize,
  resolveShowSpectrogram,
  resolveTheme,
  resolveUiScalePreset,
  type ComputeDevice,
  type StoredPreferences,
  type Theme,
  type UiScalePreset,
} from "./storage";

export type HydratedPreferences = {
  initial: { locale: AppLocale; localeManual: boolean };
  theme: Theme;
  computeDevice: ComputeDevice;
  uiScale: UiScalePreset;
  defaultDockCollapsed: boolean;
  launchFullscreen: boolean;
  dataHealthBannerEnabled: boolean;
  runtimeAutostart: boolean;
  logVerbosity: LogVerbosity;
  persistJobLogs: boolean;
  projectsRoot: string;
  spectrogramCacheDir: string;
  jobLogsDir: string;
  largeWavOptimize: boolean;
  showSpectrogram: boolean;
};

export function readInterfaceDefaults(stored: StoredPreferences) {
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

export function hydrateFromStored(stored: StoredPreferences): HydratedPreferences {
  const initial = resolveInitialLocale();
  const iface = readInterfaceDefaults(stored);
  return {
    initial,
    theme: resolveTheme(stored),
    computeDevice: resolveComputeDevice(stored),
    ...iface,
  };
}

/** One-time coerce for missing / legacy keys after async store init. */
export function firstLaunchPatch(
  stored: StoredPreferences,
  hydrated: HydratedPreferences,
): Partial<StoredPreferences> {
  const patch: Partial<StoredPreferences> = {};
  if (stored.computeDevice === undefined) {
    patch.computeDevice = DEFAULT_COMPUTE_DEVICE;
  }
  if (stored.locale === undefined) {
    patch.locale = DEFAULT_LOCALE;
    patch.localeManual = false;
  }
  // Dark-only: coerce legacy light / missing theme.
  if (stored.theme !== DEFAULT_THEME) {
    patch.theme = DEFAULT_THEME;
  }
  if (stored.dataHealthBannerEnabled === undefined) {
    patch.dataHealthBannerEnabled = false;
  }
  // Coerce stale long-WAV flag when Analysis is table-hero on disk.
  if (!hydrated.showSpectrogram && stored.largeWavOptimize === true) {
    patch.largeWavOptimize = false;
  }
  return patch;
}
