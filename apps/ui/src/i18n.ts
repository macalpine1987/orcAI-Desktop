import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslation from "../public/locales/en/en.json";
import ruTranslation from "../public/locales/ru/ru.json";
import {
  type AppLocale,
  persistLocalePreference,
  resolveInitialLocale,
} from "./i18n/locale";
import { loadStoredPreferences } from "./preferences/storage";

export type { AppLocale } from "./i18n/locale";
export {
  detectSystemLocaleAsync,
  detectSystemLocaleSync,
  localeFromLanguageTag,
  resolveInitialLocale,
} from "./i18n/locale";

const initial = resolveInitialLocale();

if (loadStoredPreferences().locale === undefined) {
  void persistLocalePreference(initial.locale, false);
}

export const i18nReady = i18n.use(initReactI18next).init({
  lng: initial.locale,
  fallbackLng: "en",
  supportedLngs: ["en", "ru"],
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: enTranslation },
    ru: { translation: ruTranslation },
  },
  react: { useSuspense: false },
});

export async function setAppLocale(
  locale: AppLocale,
  options?: { manual?: boolean },
): Promise<void> {
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  if (options?.manual) {
    persistLocalePreference(locale, true);
  }
}

export default i18n;
