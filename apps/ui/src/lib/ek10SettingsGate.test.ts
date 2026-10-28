import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");
const repo = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(uiSrc, rel), "utf8");
}

describe("T-13 settings integration gate · / m17 / m31", () => {
  it("1. Runtime tab is two-column Engine + Paths (m17/m31)", () => {
    const page = read("pages/SettingsPage.tsx");
    expect(page).toContain("SettingsRuntimePanel");
    expect(page).not.toContain("SettingsPathsPanel");
    expect(page).not.toContain('id: "paths"');
    expect(page).toContain('useState<SettingsTab>("runtime")');
    expect(page).not.toContain('id: "about"');
    expect(page).not.toContain("SettingsAboutPanel");

    const panel = read("pages/settings/SettingsRuntimePanel.tsx");
    expect(panel).toContain("settings-runtime-grid");
    expect(panel).toContain("SettingsPathsPanel");
    expect(panel).toContain("settings.runtimeAutostart");
    expect(panel).toContain("settings.largeWavOptimize");
    expect(panel).toContain("settings.showSpectrogram");
    expect(panel).toContain("settings.analysisDisplayTitle");
    expect(panel).toContain("settings-studio-inset");
    expect(panel).toContain("disabled={!showSpectrogram}");
    expect(panel).toContain("showSpectrogram && largeWavOptimize");
    expect(panel).not.toContain("settings.sidecarPort");
    expect(panel).not.toContain("settings.closeWindow");
    expect(panel).not.toContain("closeWindowHide");
    expect(panel).not.toContain("settings.parallelJobs");
    expect(panel).not.toContain("settings.logVerbosity");
    expect(panel).not.toContain("settings.persistJobLogs");
    expect(panel).not.toContain("settings.jobExportEncoding");
    expect(panel).toContain("settings.compute");
    expect(panel).toContain("disabled={!showSpectrogram}");
    expect(panel).not.toContain("settings.computeNote");
    expect(panel).not.toContain("formatAcceleratorDetail");
    expect(panel).not.toContain("runtimeEngineFooter");
    expect(panel).not.toContain("setHideOnClose");
  });

  it("2. Paths card: projects + data + sidecar log; cache clear and factory reset", () => {
    const panel = read("pages/settings/SettingsPathsPanel.tsx");
    expect(panel).toContain("wipeOrcaiDesktopDir");
    expect(panel).toContain("clearDesktopWebStorage");
    expect(panel).toContain("pickDirectory");
    expect(panel).toContain("factoryResetDesktop");
    expect(panel).toContain("openAppFolder");
    expect(panel).toContain("openAppFile");
    expect(panel).toContain("defaultProjectsRoot");
    expect(panel).toContain("desktopDataDir");
    expect(panel).toContain("sidecarLogPath");
    expect(panel).toContain("settings.pathProjects");
    expect(panel).toContain("settings.pathData");
    expect(panel).toContain("settings.pathSidecarLog");
    expect(panel).toContain("settings.pathClearCache");
    expect(panel).toContain("settings.pathFactoryReset");
    expect(panel).toContain("factoryResetDesktop");
    expect(panel).toContain("clearSpectrogramCache");
    expect(panel).toContain("notifySaved");
    expect(panel).toContain("settings.pathClearCacheDone");
    expect(panel).not.toContain("settings.pathModels");
    expect(panel).not.toContain("PROJECT_MODELS_SEGMENT");
    expect(panel).not.toContain("PROJECT_SPECTROGRAMS_SEGMENT");
    expect(panel).not.toContain('"/models"');
    expect(panel).not.toContain("joinFsPath(");

    const fsPaths = read("platform/fsPaths.ts");
    expect(fsPaths).toContain('@tauri-apps/api/path');
    expect(fsPaths).toContain("joinAppPath");
    expect(fsPaths).toContain("homeDir()");
    expect(fsPaths).not.toContain('join(await documentDir(), "orcai")');
    expect(fsPaths).toContain("shell_ensure_dir");
    expect(fsPaths).toContain("shell_ensure_file");

    const rs = readFileSync(join(repo, "src-tauri/src/lib.rs"), "utf8");
    expect(rs).toContain("shell_clear_orcai_spec_cache");
    expect(rs).toContain("shell_reset_orcai_desktop_db");
    expect(rs).toContain("shell_wipe_orcai_desktop_dir");
    expect(rs).toContain("shell_delete_preferences_store");
    expect(rs).toContain("shell_truncate_sidecar_log");
    expect(rs).toContain("shell_ensure_file");

    const reset = read("platform/desktopReset.ts");
    expect(reset).toContain("wipeOrcaiDesktopDir");
    expect(reset).toContain("deletePreferencesStoreFile");
    expect(reset).toContain("clearDesktopWebStorage");

    const prefs = read("preferences/preferencesStore.ts");
    expect(prefs).toContain("erasePreferencesStore");
    expect(prefs).toContain("shell_delete_preferences_store");

    const storage = read("preferences/storage.ts");
    expect(storage).toContain('DEFAULT_THEME: Theme = "dark"');
    expect(storage).toContain("resolveTheme");

    const ctx = read("preferences/PreferencesContext.tsx");
    expect(ctx).toContain("DEFAULT_THEME");
    expect(ctx).toContain("windowSetFullscreen(false)");
    expect(ctx).toContain("dataset.theme = theme");

    const acl = readFileSync(
      join(repo, "src-tauri/permissions/allow-window-chrome.toml"),
      "utf8",
    );
    expect(acl).toContain("window_set_fullscreen");
    expect(acl).toContain("ui_set_scale");
    const caps = readFileSync(
      join(repo, "src-tauri/capabilities/default.json"),
      "utf8",
    );
    expect(caps).toContain("allow-window-chrome");
  });

  it("3. Preferences v10 persist integration fields and inject -v into jobs", () => {
    const storage = read("preferences/storage.ts");
    expect(storage).toContain("PREFERENCES_VERSION = 12");
    for (const field of [
      "logVerbosity",
      "persistJobLogs",
      "projectsRoot",
      "spectrogramCacheDir",
      "jobLogsDir",
      "largeWavOptimize",
      "showSpectrogram",
    ]) {
      expect(storage, field).toContain(field);
    }
    expect(storage).not.toContain("maxConcurrentJobs");
    expect(storage).not.toContain("jobExportEncoding");
    expect(storage).not.toContain("sidecarPort");

    const jobs = read("api/jobs.ts");
    expect(jobs).toContain("withJobVerbosity");
    expect(jobs).not.toContain("patchJobsQueue");

    const ctx = read("preferences/PreferencesContext.tsx");
    expect(ctx).toContain("setLiveLogVerbosity");
    expect(ctx).toContain("setLiveLargeWavOptimize");
    expect(ctx).toContain("savePredictSettings");
    expect(ctx).toContain("setLogVerbosity");
    expect(ctx).toContain("eraseStoredPreferences");
    // Turning spectrogram off must clear long-WAV optimize (table-hero has no tiles).
    expect(ctx).toMatch(
      /setShowSpectrogram[\s\S]*if \(!enabled\)[\s\S]*largeWavOptimize:\s*false/,
    );
    expect(ctx).toContain("resolveLargeWavOptimize");
    expect(ctx).not.toContain("maxConcurrentJobs");
    expect(ctx).not.toContain("jobExportEncoding");

    const sidecar = read("sidecar/SidecarContext.tsx");
    expect(sidecar).toContain("port: null");
    expect(sidecar).not.toContain("sidecarPortForStart");
    expect(sidecar).not.toContain("sidecarPortPref");
    expect(sidecar).not.toContain("patchJobsQueue");
    expect(sidecar).toContain("persistJobLogs");
    // CPU/GPU restart must use host HTTP like startAll (v0.1.22 cold-start fix).
    expect(sidecar).toContain("invokeSidecarEngineStart");
    expect(sidecar).toContain("restartRuntimeForComputeDevice");
    expect(sidecar).toMatch(
      /restartRuntimeForComputeDevice[\s\S]*invokeSidecarEngineStart/,
    );

    const runtimePanel = read("pages/settings/SettingsRuntimePanel.tsx");
    // Persist CPU/GPU intent before restart; rollback preference on failure.
    expect(runtimePanel).toContain("setComputeDevice(device)");
    expect(runtimePanel).toContain("setComputeDevice(previous)");
    expect(runtimePanel).toMatch(
      /setComputeDevice\(device\);[\s\S]*restartRuntimeForComputeDevice\(device\)/,
    );
  });

  it("4. Rust sidecar_start accepts optional port + cache/log dirs", () => {
    const lib = readFileSync(join(repo, "src-tauri/src/lib.rs"), "utf8");
    expect(lib).toContain("spec_cache_dir");
    expect(lib).toContain("job_logs_dir");
    expect(lib).toContain("shell_ensure_dir");
    expect(lib).toContain("begin_sidecar_start(state.inner(), port)");
    expect(lib).not.toContain("window_set_hide_on_close");

    const rs = readFileSync(join(repo, "src-tauri/src/sidecar.rs"), "utf8");
    expect(rs).toContain("pinned_port");
    expect(rs).toContain("ORCAI_SPEC_CACHE_ROOT");
    expect(rs).toContain("SIDECAR_DEFAULT_PORT");
  });

  it("5. Sidecar queue PATCH updates max_concurrent", () => {
    const main = readFileSync(
      join(repo, "apps/sidecar/src/orcai_desktop_sidecar/main.py"),
      "utf8",
    );
    expect(main).toContain('@app.patch("/v1/jobs/queue")');
    expect(main).toContain("set_max_concurrent");
    expect(main).toContain('/v1/spectrograms/cache/clear');
    expect(main).toContain("/v1/maintenance/factory-reset");
    const queue = readFileSync(
      join(repo, "apps/sidecar/src/orcai_desktop_sidecar/job_queue.py"),
      "utf8",
    );
    expect(queue).toContain("def set_max_concurrent");
  });

  it("6. RU/EN locales cover m17 and m31 keys", () => {
    for (const loc of ["ru/ru.json", "en/en.json"]) {
      const raw = readFileSync(join(uiSrc, "../public/locales", loc), "utf8");
      for (const key of [
        '"runtimeAutostart"',
        '"largeWavOptimize"',
        '"showSpectrogram"',
        '"pathProjects"',
        '"pathData"',
        '"pathSidecarLog"',
        '"pathFactoryReset"',
        '"pathBrowse"',
      ]) {
        expect(raw, `${loc} ${key}`).toContain(key);
      }
    }
  });

  it("7. Settings inner cards use charcoal rim; work frame matches other studios", () => {
    const css = read("styles/settings-interface.css");
    expect(css).toContain("--m16-chrome-border: var(--border)");
    expect(css).toContain("--m16-table-rim-outer: #2a2c2f");
    expect(css).toContain("--st-panel: var(--mat-face)");
    expect(css).toContain("--st-card: #191a1b");
    expect(css).toContain("--st-card-rim: #2a2c2f");
    expect(css).toMatch(
      /\.settings-work-panel\.studio-panel \{[\s\S]*border: 1px solid var\(--m16-chrome-border/,
    );
    expect(css).toMatch(
      /\.settings-studio-card \{[\s\S]*border: 1px solid var\(--st-card-rim/,
    );
    expect(css).toMatch(
      /\.settings-work-panel\.studio-panel \{[\s\S]*background: var\(--st-panel/,
    );
    expect(css).toMatch(
      /\.settings-panel-body:has\(\.settings-runtime-grid\) \{[\s\S]*overflow: auto/,
    );
  });

  it("8. Mockups m17 and m31 are in the handoff folder", () => {
    const mockups = join(repo, "docs/cursor-handoff/mockups");
    expect(existsSync(join(mockups, "m17-settings.png"))).toBe(true);
    expect(existsSync(join(mockups, "m31-settings-paths.png"))).toBe(true);
  });
});
