import { isTauriRuntime } from "../api/sidecarControl";
import { helpHref } from "../lib/helpManifest";
import {
  MAIN_SHELL_WINDOW_LABEL,
  isMainShellWindow,
} from "./shellWindow";

/** Main-shell React Router navigation from a child window (train-monitor). */
export const SHELL_NAVIGATE_EVENT = "orcai-shell-navigate";

export type ShellNavigatePayload = {
  path: string;
};

export async function focusMainShellWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const main = await WebviewWindow.getByLabel(MAIN_SHELL_WINDOW_LABEL);
    if (!main) return;
    await main.show();
    await main.setFocus();
  } catch {
    /* best-effort */
  }
}

/**
 * Open ``path`` in the Lab main window (and focus it).
 * From ``main`` this is a no-op emit target — callers in AppShell should ``navigate`` directly.
 * Outside Tauri, assigns ``window.location``.
 */
export async function openPathInMainShell(path: string): Promise<void> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!isTauriRuntime()) {
    window.location.assign(normalized);
    return;
  }
  if (isMainShellWindow()) {
    window.location.assign(normalized);
    return;
  }
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo(MAIN_SHELL_WINDOW_LABEL, SHELL_NAVIGATE_EVENT, {
      path: normalized,
    } satisfies ShellNavigatePayload);
  } catch {
    /* best-effort */
  }
  await focusMainShellWindow();
}

export async function openHelpInMainShell(topic?: string): Promise<void> {
  await openPathInMainShell(helpHref({ topic }));
}
