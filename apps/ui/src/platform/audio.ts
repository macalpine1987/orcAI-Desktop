import { isTauri } from "./tauri";

/** Resolve a local WAV path to a URL the webview can play (Tauri only). */
export async function resolveLocalAudioUrl(
  absolutePath: string,
): Promise<string | null> {
  if (!isTauri() || !absolutePath) return null;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(absolutePath);
}
