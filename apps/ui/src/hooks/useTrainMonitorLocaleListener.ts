import { useEffect, type Dispatch, type SetStateAction } from "react";
import { isTauri } from "../platform/tauri";
import {
  isAppLocale,
  LOCALE_CHANGED_EVENT,
  type LocaleChangedPayload,
} from "../platform/localeSync";
import { isTrainMonitorWindow } from "../platform/shellWindow";
import type { AppLocale } from "../i18n/locale";

/**
 * Train-monitor window only: apply Lab locale changes from ``LOCALE_CHANGED_EVENT``.
 * Updates Preferences state; ``PreferencesProvider`` then calls ``setAppLocale``.
 */
export function useTrainMonitorLocaleListener(
  setLocaleState: Dispatch<SetStateAction<AppLocale>>,
  setLocaleManualState: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    if (!isTauri() || !isTrainMonitorWindow()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      return listen<LocaleChangedPayload>(LOCALE_CHANGED_EVENT, (event) => {
        const next = event.payload?.locale;
        if (!isAppLocale(next)) return;
        setLocaleState(next);
        if (typeof event.payload?.localeManual === "boolean") {
          setLocaleManualState(event.payload.localeManual);
        }
      }).then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setLocaleManualState, setLocaleState]);
}
