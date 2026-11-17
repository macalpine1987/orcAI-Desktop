import { isTauriRuntime } from "../api/sidecarControl";
import type { AppLocale } from "../i18n/locale";
import {
  isMainShellWindow,
  TRAIN_MONITOR_WINDOW_LABEL,
} from "./shellWindow";

/** Cross-window locale sync (main → train-monitor). */
export const LOCALE_CHANGED_EVENT = "orcai-locale-changed";

export type LocaleChangedPayload = {
  locale: AppLocale;
  localeManual?: boolean;
};

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "ru";
}

/**
 * Tell the detached train-monitor window to apply ``locale``.
 * No-op outside Tauri, outside the main shell, or when the monitor is absent.
 */
export async function broadcastLocaleToTrainMonitor(
  locale: AppLocale,
  options?: { localeManual?: boolean },
): Promise<void> {
  if (!isTauriRuntime() || !isMainShellWindow()) return;
  if (!isAppLocale(locale)) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const mon = await WebviewWindow.getByLabel(TRAIN_MONITOR_WINDOW_LABEL);
    if (!mon) return;
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo(TRAIN_MONITOR_WINDOW_LABEL, LOCALE_CHANGED_EVENT, {
      locale,
      localeManual: options?.localeManual,
    } satisfies LocaleChangedPayload);
  } catch {
    /* best-effort — monitor may have closed mid-emit */
  }
}
