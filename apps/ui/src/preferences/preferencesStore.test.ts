import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  erasePreferencesStore,
  initPreferencesStore,
  patchPreferencesStore,
  resetPreferencesStoreForTests,
} from "../preferences/preferencesStore";
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_VERSION,
  resolveUiScalePreset,
} from "../preferences/storage";

describe("preferencesStore · Tauri Store fallback", () => {
  beforeEach(() => {
    resetPreferencesStoreForTests();
    localStorage.clear();
  });

  afterEach(() => {
    resetPreferencesStoreForTests();
    localStorage.clear();
  });

  it("migrates legacy localStorage blob on init", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ uiScale: "125", defaultDockCollapsed: false }),
    );
    const prefs = await initPreferencesStore();
    expect(prefs.uiScale).toBe("125");
    expect(resolveUiScalePreset({ uiScale: "150" })).toBe("125");
    expect(resolveUiScalePreset({ uiScale: "100" })).toBe("100");
    expect(prefs.defaultDockCollapsed).toBe(false);
    expect(prefs.preferencesVersion).toBe(PREFERENCES_VERSION);
  });

  it("patches and reads from cache", async () => {
    await initPreferencesStore();
    const next = await patchPreferencesStore({ defaultDockCollapsed: false });
    expect(next.defaultDockCollapsed).toBe(false);
    const again = await initPreferencesStore();
    expect(again.defaultDockCollapsed).toBe(false);
  });

  it("erasePreferencesStore drops the blob without rewriting defaults", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ locale: "ru", computeDevice: "gpu" }),
    );
    await initPreferencesStore();
    const erased = await erasePreferencesStore();
    expect(erased.locale).toBe("en");
    expect(erased.computeDevice).toBe("cpu");
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });
});
