# Монитор обучения · синхронизация локали с Lab

Инструкция для Cursor на Windows. Перенести живую смену языка в окне **монитора обучения**, как на macOS после правки к orcAI Desktop **1.0.4**. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Краткая запись в журнале: `docs/WINDOWS-CHANGES-AFTER-1.0.3.md` §84.

Этот файл не входит в справку приложения. Каталог `docs/manual/` не трогать.

## Проблема

`train-monitor` — отдельный Tauri `WebviewWindow` (`label`: `train-monitor`) со своим React-деревом и своим экземпляром i18next.

Смена языка в **Настройки → Интерфейс** (Lab, окно `main`) вызывает `setAppLocale` только в main. Окно монитора остаётся на языке, с которым оно открылось, пока его не закрыть и не открыть снова.

На Windows WebView2 поведение то же: два окна = два JS-контекста. Общий `localStorage` / Tauri Store **не** гарантирует live-обновление UI монитора — нужен явный `emitTo` / `listen`.

## Не делать

- Не менять версию Desktop (`package.json`, `apps/ui/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, README).
- Не копировать скрипты сборки macOS и не трогать AUTONOMY GATE / bundled Python.
- Не полагаться на `window.addEventListener("storage", …)` или poll store как единственный канал.
- Не вызывать `emit` «всем окнам» без нужды: цель — только `train-monitor`, и только из `main`.
- Не дублировать `changeLanguage` в `TrainMonitor.tsx` в обход Preferences: слушатель обновляет state в `PreferencesProvider`, дальше уже существующий `useEffect` зовёт `setAppLocale`.
- Не синхронизировать тему / UI scale этим же событием (вне scope).
- Не переводить подписи монитора **Loss** и **LR** в русской локали.

## Поведение после фикса

1. Пользователь меняет язык в Lab при открытом мониторе.
2. Main: `setAppLocale` → `i18n.changeLanguage` → `broadcastLocaleToTrainMonitor`.
3. Broadcast: если есть окно с label `train-monitor`, `emitTo(…, "orcai-locale-changed", { locale, localeManual })`.
4. Monitor: `useTrainMonitorLocaleListener` → `setLocaleState` / при необходимости `setLocaleManualState`.
5. `PreferencesProvider` в мониторе: эффект по `locale` → локальный `setAppLocale` (без повторного broadcast: `broadcastLocaleToTrainMonitor` no-op вне `main`).

Закрытие монитора mid-emit — best-effort (`try/catch`, проверка `getByLabel`).

## Файлы

| Файл | Действие |
|---|---|
| `apps/ui/src/platform/localeSync.ts` | **новый** — `LOCALE_CHANGED_EVENT`, payload, `isAppLocale`, `broadcastLocaleToTrainMonitor` |
| `apps/ui/src/platform/localeSync.test.ts` | **новый** — unit на `isAppLocale` |
| `apps/ui/src/hooks/useTrainMonitorLocaleListener.ts` | **новый** — `listen` только в окне train-monitor |
| `apps/ui/src/i18n.ts` | в конце `setAppLocale` — dynamic import + `broadcastLocaleToTrainMonitor` |
| `apps/ui/src/preferences/PreferencesContext.tsx` | `useTrainMonitorLocaleListener(setLocaleState, setLocaleManualState)` |
| `apps/ui/src/lib/ek14TrainMonitorGate.test.ts` | string-gate на locale sync (как у `SHELL_NAVIGATE_EVENT`) |

Зависимости уже есть: `platform/shellWindow.ts` (`MAIN_SHELL_WINDOW_LABEL`, `TRAIN_MONITOR_WINDOW_LABEL`, `isMainShellWindow`, `isTrainMonitorWindow`), `@tauri-apps/api/event` (`emitTo` / `listen`), `@tauri-apps/api/webviewWindow`.

Образец паттерна «событие между окнами»: `platform/shellNavigate.ts` + `hooks/useShellNavigateListener.ts` (monitor → main). Здесь направление обратное: main → monitor.

## Как переносить

Windows-ветка может разойтись с macOS. Не делать слепой `git checkout` всего дерева.

1. Скопировать два новых файла один-в-один с macOS-дерева (или из этого репозитория):

- `apps/ui/src/platform/localeSync.ts`
- `apps/ui/src/hooks/useTrainMonitorLocaleListener.ts`
- `apps/ui/src/platform/localeSync.test.ts` (желательно)

2. В `apps/ui/src/i18n.ts` в `setAppLocale` после `changeLanguage` / persist добавить:

```ts
  // Detached train-monitor has its own i18n instance — sync from Lab.
  const { broadcastLocaleToTrainMonitor } = await import(
    "./platform/localeSync"
  );
  await broadcastLocaleToTrainMonitor(locale, {
    localeManual: options?.manual === true,
  });
```

3. В `apps/ui/src/preferences/PreferencesContext.tsx`:

- import `useTrainMonitorLocaleListener` из `../hooks/useTrainMonitorLocaleListener`;
- сразу после `useWindowChromeSync(...)` (или рядом с другими эффектами провайдера):

```ts
  useTrainMonitorLocaleListener(setLocaleState, setLocaleManualState);
```

4. В `apps/ui/src/lib/ek14TrainMonitorGate.test.ts` (блок про shell navigate / Help) добавить ассерты:

```ts
    expect(read("platform/localeSync.ts")).toContain("LOCALE_CHANGED_EVENT");
    expect(read("platform/localeSync.ts")).toContain(
      "broadcastLocaleToTrainMonitor",
    );
    expect(read("hooks/useTrainMonitorLocaleListener.ts")).toContain(
      "LOCALE_CHANGED_EVENT",
    );
    expect(read("preferences/PreferencesContext.tsx")).toContain(
      "useTrainMonitorLocaleListener",
    );
    expect(read("i18n.ts")).toContain("broadcastLocaleToTrainMonitor");
```

5. Проверка:

```bash
cd apps/ui && npx vitest run src/platform/localeSync.test.ts src/lib/ek14TrainMonitorGate.test.ts
```

## QA вручную (Windows)

1. Запустить sidecar + движок, открыть проект с обучением, открыть **Монитор обучения** (отдельное окно).
2. В Lab: **Настройки → Интерфейс** → сменить язык RU ↔ EN.
3. Окно монитора без перезапуска: заголовок, подзаголовок, Stop / Open folder / Done, подсказки — на новом языке.
4. Закрыть монитор, сменить язык, открыть снова — язык совпадает с Lab (как и раньше за счёт store на старте).
5. Смена языка при закрытом мониторе не должна падать (broadcast no-op).

## Эталон содержимого новых файлов

### `apps/ui/src/platform/localeSync.ts`

```ts
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
```

Если на Windows `isTauriRuntime` / `isTauri` названы иначе — сохранить локальные имена хелперов, смысл тот же: broadcast только из main в Tauri; listen только в train-monitor.

### `apps/ui/src/hooks/useTrainMonitorLocaleListener.ts`

```ts
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
```
