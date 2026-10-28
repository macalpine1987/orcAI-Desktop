import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type SidecarStartOptions = {
  port?: number | null;
  specCacheDir?: string | null;
  jobLogsDir?: string | null;
};

export async function invokeSidecarStart(
  opts?: SidecarStartOptions,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Sidecar control requires the desktop app (Tauri).");
  }
  await invoke("sidecar_start", {
    port: opts?.port ?? null,
    specCacheDir: opts?.specCacheDir || null,
    jobLogsDir: opts?.jobLogsDir || null,
  });
}

export async function invokeSidecarStop(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("sidecar_stop");
}

export async function invokeSidecarIsRunning(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>("sidecar_is_running");
}

export async function invokeSidecarGetPort(): Promise<number | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const port = await invoke<number | null>("sidecar_get_port");
  return port ?? null;
}

export async function invokeSidecarEngineStart(
  computeDevice: "cpu" | "gpu",
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Engine start requires the desktop app (Tauri).");
  }
  await invoke("sidecar_engine_start", { computeDevice });
}
