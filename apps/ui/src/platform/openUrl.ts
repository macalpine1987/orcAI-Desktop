import { isTauri } from "./tauri";

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("shell_open_url", { url });
    return true;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** LICENSE / NOTICE / THIRD_PARTY_LICENSES inside Contents/Resources. */
export async function bundledLegalPath(fileName: string): Promise<string> {
  if (!isTauri()) return "";
  const { resourceDir, join } = await import("@tauri-apps/api/path");
  return join(await resourceDir(), fileName);
}
