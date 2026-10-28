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

/** Russian OS/UI language → ru, anything else → en. */
export function localeFromLanguageTag(tag: string): AppLocale {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "ru" || normalized.startsWith("ru-")) {
    return "ru";
  }
  return "en";
}

/** Browser / WebView fallback (also used in Vite dev). */
export function detectSystemLocaleSync(): AppLocale {
  const candidates: string[] = [];
  if (typeof navigator !== "undefined") {
    if (navigator.language) candidates.push(navigator.language);
    if (navigator.languages?.length) {
      candidates.push(...navigator.languages);
    }
  }
  for (const tag of candidates) {
    if (localeFromLanguageTag(tag) === "ru") {
      return "ru";
    }
  }
  return "en";
}

export async function detectSystemLocaleAsync(): Promise<AppLocale> {
  try {
    const { readSystemLocale } = await import("../platform/systemLocale");
    return await readSystemLocale();
  } catch {
    return detectSystemLocaleSync();
  }
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
