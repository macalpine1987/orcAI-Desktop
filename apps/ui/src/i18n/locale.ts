import {
  type AppLocale,
  DEFAULT_LOCALE,
  loadStoredPreferences,
  PREFERENCES_VERSION,
  resolveComputeDevice,
  resolveStoredLocale,
  resolveTheme,
  resolveUiScalePreset,
  saveStoredPreferences,
  type StoredPreferences,
} from "../preferences/storage";

export type { AppLocale } from "../preferences/storage";
export { DEFAULT_LOCALE };

/**
 * Map a BCP 47 / OS language tag to the two UI locales.
 * Kept as a pure helper for Settings / tests; first launch and factory reset
 * use DEFAULT_LOCALE (en) — OS auto-detect was removed as an unused path.
 */
export function localeFromLanguageTag(tag: string): AppLocale {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "ru" || normalized.startsWith("ru-")) {
    return "ru";
  }
  return "en";
}

export function migratePreferences(
  stored: StoredPreferences,
): StoredPreferences {
  return {
    ...stored,
    preferencesVersion: PREFERENCES_VERSION,
    locale: resolveStoredLocale(stored),
    localeManual: stored.localeManual ?? false,
    theme: resolveTheme(stored),
    computeDevice: resolveComputeDevice(stored),
    uiScale: resolveUiScalePreset(stored),
    defaultDockCollapsed: stored.defaultDockCollapsed ?? true,
    launchFullscreen: stored.launchFullscreen ?? false,
  };
}

export type ResolvedLocale = {
  locale: AppLocale;
  localeManual: boolean;
};

/** Locale for first paint (sync). Missing store → English. */
export function resolveInitialLocale(): ResolvedLocale {
  const stored = migratePreferences(loadStoredPreferences());
  return {
    locale: resolveStoredLocale(stored),
    localeManual: stored.localeManual ?? false,
  };
}

export async function persistLocalePreference(
  locale: AppLocale,
  localeManual: boolean,
): Promise<void> {
  await saveStoredPreferences({ locale, localeManual });
}
