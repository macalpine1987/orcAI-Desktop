import {
  erasePreferencesStore,
  getPreferencesCache,
  patchPreferencesStore,
  replacePreferencesStore,
} from "./preferencesStore";

export {
  initPreferencesStore,
  isPreferencesStoreReady,
  PREFERENCES_STORE_BLOB_KEY,
  PREFERENCES_STORE_FILE,
} from "./preferencesStore";

export const PREFERENCES_STORAGE_KEY = "orcai-desktop.preferences";

export const PREFERENCES_VERSION = 12;

export type AppLocale = "en" | "ru";

export type Theme = "light" | "dark";

export type ComputeDevice = "cpu" | "gpu";

export type UiScalePreset = "100" | "125";

/** Legacy stored values — `"system"` and retired `"150"` migrate on read. */
export type LegacyUiScalePreset = UiScalePreset | "system" | "150";

export type DefaultDockMode = "collapsed" | "expanded";

/** Default on first launch; GPU is only used after the user selects it in Settings. */
export const DEFAULT_COMPUTE_DEVICE: ComputeDevice = "cpu";

/** Default UI language on first launch and after factory reset. */
export const DEFAULT_LOCALE: AppLocale = "en";

/** Default appearance on first launch and after factory reset. */
export const DEFAULT_THEME: Theme = "dark";

export function resolveComputeDevice(stored: StoredPreferences): ComputeDevice {
  return stored.computeDevice === "gpu" ? "gpu" : DEFAULT_COMPUTE_DEVICE;
}

/** Dark-only product UI — ignore legacy ``light`` values. */
export function resolveTheme(
  _stored?: Pick<StoredPreferences, "theme">,
): Theme {
  return DEFAULT_THEME;
}

/** Shell data-health banner; default off (opt-in). */
export function resolveDataHealthBannerEnabled(
  stored: Pick<StoredPreferences, "dataHealthBannerEnabled">,
): boolean {
  return stored.dataHealthBannerEnabled === true;
}

/** Analysis spectrogram; default on. */
export function resolveShowSpectrogram(
  stored: Pick<StoredPreferences, "showSpectrogram">,
): boolean {
  return stored.showSpectrogram !== false;
}

/**
 * Windowed STFT for long WAVs. Only meaningful with spectrogram on;
 * coerce off when Analysis is in table-hero mode.
 */
export function resolveLargeWavOptimize(
  stored: Pick<StoredPreferences, "largeWavOptimize" | "showSpectrogram">,
): boolean {
  return (
    resolveShowSpectrogram(stored) && stored.largeWavOptimize === true
  );
}

export function resolveStoredLocale(
  stored: Pick<StoredPreferences, "locale">,
): AppLocale {
  return stored.locale === "ru" ? "ru" : DEFAULT_LOCALE;
}

export function resolveUiScalePreset(
  stored: Pick<StoredPreferences, "uiScale">,
): UiScalePreset {
  const scale = stored.uiScale;
  if (scale === "125" || scale === "150") return "125";
  return "100";
}

export type StoredPreferences = {
  preferencesVersion?: number;
  locale?: AppLocale;
  localeManual?: boolean;
  theme?: string;
  computeDevice?: ComputeDevice;
  uiScale?: LegacyUiScalePreset;
  defaultDockCollapsed?: boolean;
  /** When true, main window opens fullscreen on launch (F11 still toggles at runtime). */
  launchFullscreen?: boolean;
  /**
   * When true, show the shell data-health advisory banner (default off).
   * Does not affect hard predict/pipeline gates.
   */
  dataHealthBannerEnabled?: boolean;
  /** When true, Sidecar + orcAI engine start automatically on app launch. Default off. */
  runtimeAutostart?: boolean;
  /** orcAI `-v` for new jobs. Default 2. */
  logVerbosity?: 0 | 1 | 2 | 3;
  /** Keep job history between launches (SQLite). Default true. */
  persistJobLogs?: boolean;
  /** Parent folder for new projects. */
  projectsRoot?: string;
  /** Override spectrogram tile cache (empty = sidecar default). */
  spectrogramCacheDir?: string;
  /** Override job / sidecar log folder (empty = app log dir). */
  jobLogsDir?: string;
  /** Windowed STFT for long WAVs + skip full neighbor prefetch. Default off. */
  largeWavOptimize?: boolean;
  /**
   * When true (default), Analysis shows the spectrogram studio.
   * When false — detections table fills the hero (no plot / transport / class rail).
   */
  showSpectrogram?: boolean;
};

/** Sync read (Tauri Store cache or legacy localStorage before init). */
export function loadStoredPreferences(): StoredPreferences {
  return getPreferencesCache();
}

export async function saveStoredPreferences(
  patch: Partial<StoredPreferences>,
): Promise<StoredPreferences> {
  return patchPreferencesStore(patch);
}

/** Replace the whole blob (does not merge leftover keys). */
export async function replaceStoredPreferences(
  next: StoredPreferences,
): Promise<StoredPreferences> {
  return replacePreferencesStore(next);
}

/** Drop `preferences.json` / localStorage so reset matches a clean first launch. */
export async function eraseStoredPreferences(): Promise<StoredPreferences> {
  return erasePreferencesStore();
}
