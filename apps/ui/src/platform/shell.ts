import { isTauri } from "./tauri";

/** Reveal a file in Finder / Explorer / file manager. Falls back to clipboard in dev. */
export async function revealInFileManager(path: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("shell_reveal_in_finder", { path });
    return true;
  }
  try {
    await navigator.clipboard.writeText(path);
    return true;
  } catch {
    return false;
  }
}

/** Write UTF-8 text to an absolute path (Tauri only). */
export async function writeTextFileAbsolute(
  path: string,
  contents: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shell_write_text_file", { path, contents });
  return true;
}
