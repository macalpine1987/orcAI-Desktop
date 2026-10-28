import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");

describe("static gate · Settings foundation", () => {
  it("SettingsPage has m28 tabs, Runtime and Interface panels", () => {
    const page = readFileSync(join(uiSrc, "pages/SettingsPage.tsx"), "utf8");
    expect(page).toContain("SettingsInterfacePanel");
    expect(page).toContain("SettingsRuntimePanel");
    for (const key of ["settings.tabRuntime", "settings.tabInterface"]) {
      expect(page, key).toContain(key);
    }
    expect(page).not.toContain("settings.tabPaths");
    expect(page).not.toContain("settings.tabAbout");
    expect(page).not.toContain('id: "about"');
    expect(page).not.toContain("SettingsAboutPanel");
    expect(page).toContain("setActiveTab");
    expect(page).toContain("predict-tabs-m03");
    expect(page).toContain("predict-tab");
  });

  it("SettingsRuntimePanel exposes CPU/GPU control", () => {
    const panel = readFileSync(
      join(uiSrc, "pages/settings/SettingsRuntimePanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("settings.compute");
    expect(panel).toContain("SegmentedControl<ComputeDevice>");
    expect(panel).toContain("restartRuntimeForComputeDevice");
  });

  it("SettingsInterfacePanel exposes m28 controls without removed hints", () => {
    const panel = readFileSync(
      join(uiSrc, "pages/settings/SettingsInterfacePanel.tsx"),
      "utf8",
    );
    for (const key of [
      "settings.uiScale",
      "settings.fullscreen",
      "settings.defaultDock",
      "settings.dataHealthBanner",
      "settings-select",
      "ToggleSwitch",
      "launchFullscreen",
      "setLaunchFullscreen",
      "dataHealthBannerEnabled",
      "setDataHealthBannerEnabled",
      "setDefaultDockMode",
    ]) {
      expect(panel, key).toContain(key);
    }
    expect(panel).not.toContain("settings.theme");
    expect(panel).not.toContain("setTheme");
    expect(panel).not.toContain("hideOnClose");
    expect(panel).not.toContain("settings.predictGlossaryHint");
    expect(panel).not.toContain("settings.uiScaleNfr");
    expect(panel).not.toContain('"system"');
  });

  it("preferences storage v8 fields", () => {
    const storage = readFileSync(join(uiSrc, "preferences/storage.ts"), "utf8");
    expect(storage).toContain("PREFERENCES_VERSION = 12");
    for (const field of [
      "uiScale",
      "defaultDockCollapsed",
      "launchFullscreen",
      "dataHealthBannerEnabled",
    ]) {
      expect(storage).toContain(field);
    }
    expect(storage).not.toContain("hideOnClose");
    expect(storage).not.toContain('"system" | "100"');
    // Opt-in: missing key → off (=== true), not opt-out (!== false).
    expect(storage).toMatch(
      /resolveDataHealthBannerEnabled[\s\S]*?===\s*true/,
    );
  });

  it("data-health banner defaults off on first launch and factory reset", () => {
    const ctx = readFileSync(
      join(uiSrc, "preferences/PreferencesContext.tsx"),
      "utf8",
    );
    expect(ctx).toMatch(
      /dataHealthBannerEnabled === undefined[\s\S]*?firstLaunchPatch\.dataHealthBannerEnabled = false/,
    );
    expect(ctx).toContain("setDataHealthBannerEnabledState(false)");
    expect(ctx).toMatch(
      /resetToFactoryDefaults[\s\S]*?dataHealthBannerEnabled:\s*false/,
    );
    expect(ctx).not.toMatch(
      /firstLaunchPatch\.dataHealthBannerEnabled = true/,
    );
  });

  it("preferences use Tauri Store with legacy migration", () => {
    const store = readFileSync(
      join(uiSrc, "preferences/preferencesStore.ts"),
      "utf8",
    );
    expect(store).toContain("PREFERENCES_STORE_FILE");
    expect(store).toContain("initPreferencesStore");
    expect(store).toContain("@tauri-apps/plugin-store");
    const lib = readFileSync(
      join(uiSrc, "../../../src-tauri/src/lib.rs"),
      "utf8",
    );
    expect(lib).toContain("tauri_plugin_store");
    expect(lib).toContain("apply_shell_prefs_from_store");
    expect(lib).toContain("launchFullscreen");
  });

  it("PreferencesContext wires window chrome sync", () => {
    const ctx = readFileSync(join(uiSrc, "preferences/PreferencesContext.tsx"), "utf8");
    expect(ctx).toContain("useWindowChromeSync");
    expect(ctx).toContain("setUiScale");
    expect(ctx).toContain("setDefaultDockMode");
    expect(ctx).toContain("setLaunchFullscreen");
    expect(ctx).not.toContain("setHideOnClose");
  });

  it("Rust keeps fixed macOS hide-on-close without user setting", () => {
    const lib = readFileSync(
      join(uiSrc, "../../../src-tauri/src/lib.rs"),
      "utf8",
    );
    expect(lib).toContain("hide_on_close_enabled");
    expect(lib).not.toContain("window_set_hide_on_close");
    expect(lib).not.toContain("hideOnClose");
  });

  it("LabDock uses preferences for default dock", () => {
    const dock = readFileSync(join(uiSrc, "components/LabDock.tsx"), "utf8");
    expect(dock).toContain("defaultDockCollapsed");
    expect(dock).toContain("setDefaultDockMode");
  });

  it("RU/EN locales define interface settings keys", () => {
    for (const loc of ["ru/ru.json", "en/en.json"]) {
      const raw = readFileSync(
        join(uiSrc, "../public/locales", loc),
        "utf8",
      );
      expect(raw).toContain('"tabInterface"');
      expect(raw).toContain('"uiScale"');
      expect(raw).toContain('"defaultDock"');
    }
  });

  it("index.css imports settings-interface.css (m28 layout styles)", () => {
    const css = readFileSync(join(uiSrc, "index.css"), "utf8");
    expect(css).toContain('./styles/settings-interface.css');
  });
});
