import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

/** Shell close policy: `"hide"` (macOS) or `"stop_and_close"` (other). */
export async function windowClosePolicy(): Promise<"hide" | "stop_and_close"> {
  if (!isTauri()) return "stop_and_close";
  const policy = await invoke<string>("window_close_policy");
  return policy === "hide" ? "hide" : "stop_and_close";
}

export async function windowSetFullscreen(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("window_set_fullscreen", { enabled });
}

export async function windowIsFullscreen(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("window_is_fullscreen");
}

export async function uiGetScale(): Promise<number> {
  if (!isTauri()) return 1.0;
  return invoke<number>("ui_get_scale");
}

/** Persist UI scale in the shell. Allowed: 1.0, 1.25. */
export async function uiSetScale(scale: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("ui_set_scale", { scale });
}
