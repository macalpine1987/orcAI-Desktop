/** Notice when the active project folder vanished and was pruned from the registry. */

export type ClearedActiveProjectNotice = {
  path: string | null;
  name: string | null;
};

export const CLEARED_ACTIVE_PROJECT_EVENT = "orcai-desktop:cleared-active-project";

/** localStorage — survives webview reload / app quit until dismiss (variant A). */
const STORAGE_KEY = "orcai-desktop.cleared-active-project";

/** In-memory fallback when storage is unavailable (P2-13). */
let memoryNotice: ClearedActiveProjectNotice | null = null;

function readStored(): ClearedActiveProjectNotice | null {
  try {
    const raw =
      (typeof localStorage !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null) ??
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(STORAGE_KEY)
        : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClearedActiveProjectNotice;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      path: typeof parsed.path === "string" ? parsed.path : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
    };
  } catch {
    return null;
  }
}

function writeStored(notice: ClearedActiveProjectNotice | null): void {
  try {
    if (notice) {
      const raw = JSON.stringify(notice);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, raw);
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, raw);
      }
    } else {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    /* private mode / quota */
  }
}

export function publishClearedActiveProjectNotice(
  notice: ClearedActiveProjectNotice,
): void {
  memoryNotice = notice;
  writeStored(notice);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CLEARED_ACTIVE_PROJECT_EVENT, { detail: notice }),
  );
}

export function peekClearedActiveProjectNotice(): ClearedActiveProjectNotice | null {
  if (memoryNotice) return memoryNotice;
  const stored = readStored();
  if (stored) {
    memoryNotice = stored;
    return stored;
  }
  return null;
}

export function dismissClearedActiveProjectNotice(): void {
  memoryNotice = null;
  writeStored(null);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CLEARED_ACTIVE_PROJECT_EVENT, { detail: null }),
  );
}
