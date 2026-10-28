import { isTauri } from "./tauri";

const WEB_STORAGE_PREFIXES = [
  "orcai-desktop.",
  "orcai.",
  "orcai-spectrogram",
];

export async function clearSpecCacheOnDisk(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_clear_orcai_spec_cache");
}

export async function resetDesktopDbOnDisk(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_reset_orcai_desktop_db");
}

export async function wipeOrcaiDesktopDir(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_wipe_orcai_desktop_dir");
}

export async function deletePreferencesStoreFile(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_delete_preferences_store");
}

export async function truncateSidecarLog(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_truncate_sidecar_log");
}

function removePrefixedKeys(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (WEB_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    storage.removeItem(key);
  }
}

/** Drop WebView leftovers so reset does not leave localStorage / sessionStorage. */
export function clearDesktopWebStorage(): void {
  try {
    removePrefixedKeys(localStorage);
  } catch {
    /* private mode */
  }
  try {
    removePrefixedKeys(sessionStorage);
  } catch {
    /* private mode */
  }
}
