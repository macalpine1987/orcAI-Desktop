/**
 * Tauri Store persistence for app preferences.
 * Falls back to localStorage in Vite dev / unit tests.
 */

import { isTauri } from "../platform/tauri";
import { migratePreferences } from "../i18n/locale";
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  type StoredPreferences,
} from "./storage";

/** Store file + blob key — must match Rust `apply_shell_prefs_from_store`. */
export const PREFERENCES_STORE_FILE = "preferences.json";
export const PREFERENCES_STORE_BLOB_KEY = "preferences";

type StoreHandle = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<void>;
  save: () => Promise<void>;
  clear?: () => Promise<void>;
};

let cache: StoredPreferences | null = null;
let storeHandle: StoreHandle | null = null;
let initPromise: Promise<StoredPreferences> | null = null;

function readLegacyLocalStorage(): StoredPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPreferences) : {};
  } catch {
    return {};
  }
}

function writeLegacyLocalStorage(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

async function openStore(): Promise<StoreHandle | null> {
  if (!isTauri()) return null;
  const { load } = await import("@tauri-apps/plugin-store");
  const store = await load(PREFERENCES_STORE_FILE, { autoSave: false });
  return store as unknown as StoreHandle;
}

async function writeToStore(prefs: StoredPreferences): Promise<void> {
  if (storeHandle) {
    await storeHandle.set(PREFERENCES_STORE_BLOB_KEY, prefs);
    await storeHandle.save();
    return;
  }
  writeLegacyLocalStorage(prefs);
}

/** Load Tauri Store (once), migrate legacy localStorage if needed. */
export async function initPreferencesStore(): Promise<StoredPreferences> {
  if (cache !== null) return cache;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    storeHandle = await openStore();
    const legacy = readLegacyLocalStorage();

    if (storeHandle) {
      const fromStore = await storeHandle.get<StoredPreferences>(
        PREFERENCES_STORE_BLOB_KEY,
      );
      if (fromStore && typeof fromStore === "object") {
        cache = migratePreferences(fromStore);
      } else if (Object.keys(legacy).length > 0) {
        cache = migratePreferences(legacy);
        await writeToStore(cache);
        try {
          localStorage.removeItem(PREFERENCES_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } else {
        cache = migratePreferences({});
      }
      return cache;
    }

    cache = migratePreferences(legacy);
    return cache;
  })();

  return initPromise;
}

/** Sync read — uses cache after init, else legacy localStorage. */
export function getPreferencesCache(): StoredPreferences {
  if (cache !== null) return cache;
  return migratePreferences(readLegacyLocalStorage());
}

export function isPreferencesStoreReady(): boolean {
  return cache !== null;
}

export async function patchPreferencesStore(
  patch: Partial<StoredPreferences>,
): Promise<StoredPreferences> {
  if (!initPromise) {
    await initPreferencesStore();
  }
  const current = getPreferencesCache();
  const next: StoredPreferences = {
    ...current,
    preferencesVersion: PREFERENCES_VERSION,
    ...patch,
  };
  cache = migratePreferences(next);
  await writeToStore(cache);
  return cache;
}

/** Overwrite the store with `next` (no merge of previous keys). */
export async function replacePreferencesStore(
  next: StoredPreferences,
): Promise<StoredPreferences> {
  if (!initPromise) {
    await initPreferencesStore();
  }
  cache = migratePreferences({
    ...next,
    preferencesVersion: PREFERENCES_VERSION,
  });
  await writeToStore(cache);
  return cache;
}

/** First-launch memory: drop the on-disk store so the computer stays clean. */
export async function erasePreferencesStore(): Promise<StoredPreferences> {
  if (!initPromise) {
    await initPreferencesStore();
  }
  cache = migratePreferences({});
  if (storeHandle?.clear) {
    await storeHandle.clear();
  }
  try {
    localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("shell_delete_preferences_store");
  }
  return cache;
}

/** Test helper — reset in-memory state. */
export function resetPreferencesStoreForTests(): void {
  cache = null;
  storeHandle = null;
  initPromise = null;
}
