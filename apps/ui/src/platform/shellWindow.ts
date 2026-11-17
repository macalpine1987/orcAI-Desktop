import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../api/sidecarControl";

/** Lab shell window label from `tauri.conf.json`. */
export const MAIN_SHELL_WINDOW_LABEL = "main";

/** Secondary training-monitor window. */
export const TRAIN_MONITOR_WINDOW_LABEL = "train-monitor";

/** Current Tauri window label, or `main` outside Tauri / on failure. */
export function currentShellWindowLabel(): string {
  if (!isTauriRuntime()) return MAIN_SHELL_WINDOW_LABEL;
  try {
    return getCurrentWindow().label || MAIN_SHELL_WINDOW_LABEL;
  } catch {
    return MAIN_SHELL_WINDOW_LABEL;
  }
}

export function isMainShellWindow(): boolean {
  return currentShellWindowLabel() === MAIN_SHELL_WINDOW_LABEL;
}

export function isTrainMonitorWindow(): boolean {
  return currentShellWindowLabel() === TRAIN_MONITOR_WINDOW_LABEL;
}
