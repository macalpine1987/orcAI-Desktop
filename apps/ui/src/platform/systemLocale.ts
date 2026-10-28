import { locale } from "@tauri-apps/plugin-os";
import {
  detectSystemLocaleSync,
  localeFromLanguageTag,
  type AppLocale,
} from "../i18n/locale";
import { isTauri } from "./tauri";

/** Native OS locale in Tauri; `navigator` in the browser dev server. */
export async function readSystemLocale(): Promise<AppLocale> {
  if (isTauri()) {
    try {
      const tag = await locale();
      if (tag) {
        return localeFromLanguageTag(tag);
      }
    } catch {
      // fall through to navigator
    }
  }
  return detectSystemLocaleSync();
}
