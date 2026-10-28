import { joinFsPath } from "../lib/joinFsPath";
import { isTauri } from "./tauri";

/** Join path segments via the shell API — never `'/'` in UI. */
export async function joinAppPath(...parts: string[]): Promise<string> {
  const cleaned = parts.filter((part) => typeof part === "string" && part.length > 0);
  if (cleaned.length === 0) return "";
  if (isTauri()) {
    const { join } = await import("@tauri-apps/api/path");
    return join(...cleaned);
  }
  return joinFsPath(...cleaned);
}

/** Home directory. It already exists, so the project wizard does not depend on a missing folder. */
export async function defaultProjectsRoot(): Promise<string> {
  if (isTauri()) {
    const { homeDir } = await import("@tauri-apps/api/path");
    return homeDir();
  }
  return joinFsPath("/tmp");
}

export async function defaultJobLogsDir(): Promise<string> {
  if (isTauri()) {
    const { appLogDir } = await import("@tauri-apps/api/path");
    return appLogDir();
  }
  return joinFsPath("/tmp", "orcai-desktop-logs");
}

export async function defaultSpectrogramCacheDir(): Promise<string> {
  if (isTauri()) {
    const { homeDir, join } = await import("@tauri-apps/api/path");
    return join(await homeDir(), ".orcai-desktop", "spec-cache");
  }
  return joinFsPath("/tmp", ".orcai-desktop", "spec-cache");
}

/** SQLite (`app.db`) and tile cache live here — not Tauri Application Support. */
export async function desktopDataDir(): Promise<string> {
  if (isTauri()) {
    const { homeDir, join } = await import("@tauri-apps/api/path");
    return join(await homeDir(), ".orcai-desktop");
  }
  return joinFsPath("/tmp", ".orcai-desktop");
}

export async function sidecarLogPath(): Promise<string> {
  if (isTauri()) {
    const { appLogDir, join } = await import("@tauri-apps/api/path");
    return join(await appLogDir(), "sidecar.log");
  }
  return joinFsPath("/tmp", "orcai-desktop-logs", "sidecar.log");
}

/** Display `$HOME/…` as `~/…` without joining segments in UI code. */
export async function formatUserPath(abs: string): Promise<string> {
  if (!abs) return "";
  if (!isTauri()) return abs;
  const { homeDir } = await import("@tauri-apps/api/path");
  const home = (await homeDir()).replace(/[/\\]+$/, "");
  if (abs === home) return "~";
  const slash = abs.startsWith(`${home}\\`) ? "\\" : abs.startsWith(`${home}/`) ? "/" : "";
  if (!slash) return abs;
  return `~${abs.slice(home.length)}`;
}

export async function ensureAppDir(path: string): Promise<void> {
  if (!path) return;
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("shell_ensure_dir", { path });
    return;
  }
}

export async function openAppFolder(path: string): Promise<boolean> {
  if (!path) return false;
  await ensureAppDir(path);
  const { revealInFileManager } = await import("./shell");
  return revealInFileManager(path);
}

/** Reveal a file; create an empty file if it does not exist yet. */
export async function openAppFile(path: string): Promise<boolean> {
  if (!path) return false;
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("shell_ensure_file", { path });
  }
  const { revealInFileManager } = await import("./shell");
  return revealInFileManager(path);
}
