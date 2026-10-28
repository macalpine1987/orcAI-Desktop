import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = (...parts: string[]) => resolve(root, "src", ...parts);
const locale = (lang: "ru" | "en") =>
  resolve(root, `public/locales/${lang}/${lang}.json`);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function homeLocale(lang: "ru" | "en"): Record<string, string> {
  const rootJson = readJson(locale(lang));
  return rootJson.home as Record<string, string>;
}

describe("T-1 home gate · A runtime (m01)", () => {
  it("A-01 Home wires four runtime rows with status dots", () => {
    const page = read(src("pages/HomePage.tsx"));
    const panel = read(src("components/RuntimeControlPanel.tsx"));
    expect(page).toContain("sidecarLine=");
    expect(page).toContain("engineLine=");
    expect(page).toContain("pythonLine=");
    expect(page).toContain("acceleratorLine=");
    expect(panel).toContain("runtime-row-lamp");
    expect(panel).toContain("RuntimeComponentRow");
  });

  it("Home uses studio-panel outer frame like Jobs/Settings", () => {
    const page = read(src("pages/HomePage.tsx"));
    const shell = read(src("layout/AppShell.tsx"));
    const css = read(resolve(root, "src/styles/home.css"));
    expect(page).toContain('className="studio-panel home-work-panel"');
    expect(page).toContain("PageHelpButton");
    expect(page).toContain("home-page-header");
    expect(shell).toContain("app-viewport--home-studio");
    expect(shell).toContain("mat-shell-main--home-studio");
    expect(css).toContain(".home-work-panel");
    expect(css).toContain("app-viewport--home-studio");
    // Face on canvas (Jobs pattern) — canvas-on-canvas made the rim invisible.
    expect(css).toMatch(
      /\.home-work-panel\.studio-panel[\s\S]*?background:\s*var\(--mat-face\)/,
    );
    expect(css).toContain("--home-btn-radius");
    expect(css).toContain("--home-btn-border");
    expect(css).toContain("--home-card-radius");
    expect(css).toContain(".home-runtime-footer .mat-btn");
    expect(css).toContain(".home-project-footer .mat-btn");
  });

  it("A-02 engine/python/sidecar detail strings include version/port/bundled", () => {
    const page = read(src("pages/HomePage.tsx"));
    expect(page).toContain("runtimeSidecarPort");
    expect(page).toContain("runtimeEngineBundled");
    expect(page).toContain("runtimePythonBundled");
    expect(page).toContain("formatRuntimeAcceleratorLabel");
    const ru = homeLocale("ru");
    const en = homeLocale("en");
    expect(ru.runtimeEngineBundled).toContain("bundled");
    expect(en.runtimeEngineBundled).toContain("bundled");
    expect(ru.runtimeEngineBundled).toContain("{{version}}");
    expect(en.runtimeSidecarPort).toMatch(/\{\{\s*port\s*\}\}/);
  });

  it("A-03 RuntimeControlPanel dual primary Start/Restart + Stop", () => {
    const panel = read(src("components/RuntimeControlPanel.tsx"));
    expect(panel).toContain('primaryAction === "start"');
    expect(panel).toContain('? "restart"');
    expect(panel).toContain("serviceStart");
    expect(panel).toContain("serviceRestart");
    expect(panel).toContain("serviceStop");
    expect(panel).toContain("canStop");
  });

  it("A-04 runtimeAutostart defaults off in preferences", () => {
    const prefs = read(src("preferences/PreferencesContext.tsx"));
    const storage = read(src("preferences/storage.ts"));
    expect(storage).toContain("runtimeAutostart");
    expect(prefs).toContain("runtimeAutostart: stored.runtimeAutostart ?? false");
    const page = read(src("pages/HomePage.tsx"));
    expect(page).toContain("runtimeAutostart={runtimeAutostart}");
    expect(page).toContain("onRuntimeAutostartChange={setRuntimeAutostart}");
  });

  it("A · Python ok follows sidecar; accelerator CPU ≠ Available", () => {
    const page = read(src("pages/HomePage.tsx"));
    expect(page).toContain("isActiveCpu");
    expect(page).toContain("runtimeAcceleratorCpu");
    expect(page).toContain("acceleratorGpuReady");
    expect(page).toMatch(
      /pythonLine=\{\{[\s\S]*?ok:\s*sidecarPhase === "running"/,
    );
  });

  it("A · runtime detail under label left; status alone on right (m01)", () => {
    const panel = read(src("components/RuntimeControlPanel.tsx"));
    expect(panel).toContain("runtime-component-main");
    expect(panel).toContain("runtime-component-detail");
    expect(panel).toContain("runtime-component-status");
    expect(panel).toContain("runtime-row-lamp");
    expect(panel).not.toContain("runtime-component-right");
    const css = read(resolve(root, "src/styles/home.css"));
    expect(css).toContain(".runtime-component-main");
  });

  it("A · home.css defines visible jewel status lamps", () => {
    const css = read(resolve(root, "src/styles/home.css"));
    expect(css).toContain(".runtime-row-lamp");
    expect(css).toContain(".runtime-row-lamp.is-ready");
    expect(css).toContain(".runtime-row-lamp.is-available");
    expect(css).toContain("runtime-row-lamp-well");
    expect(css).toContain("runtime-row-lamp-jewel");
  });
});

describe("T-1 home gate · B project + summary", () => {
  it("B-01 HomeProjectCard LCD metrics come from summary props", () => {
    const card = read(src("pages/home/HomeProjectCard.tsx"));
    const page = read(src("pages/HomePage.tsx"));
    expect(page).toContain("summary?.metrics.recordings");
    expect(page).toContain("summary?.metrics.annotations");
    expect(page).toContain("summary?.metrics.predicted");
    expect(card).toContain("home.projectMetricRecordings");
    expect(card).toContain("home.projectMetricAnnotations");
    expect(card).toContain("home.projectMetricPredicted");
    expect(card).toContain("home.projectMetricModel");
    expect(card).not.toContain("= 12");
    expect(card).toContain("home-card-eyebrow");
    expect(card).toContain("home-project-name");
    expect(card).toContain("shortHomeModelLabel");
  });

  it("B-02 table sync status keys for current/stale/missing", () => {
    const card = read(src("pages/home/HomeProjectCard.tsx"));
    expect(card).toContain("home.projectTableCurrent");
    expect(card).toContain("home.projectTableStale");
    expect(card).toContain("home.projectTableMissing");
    expect(card).toContain("tableSyncStatus");
    const page = read(src("pages/HomePage.tsx"));
    expect(page).toContain("summary?.recording_table.sync_status");
  });

  it("B-03 readiness panel deferred off Home ", () => {
    const page = read(src("pages/HomePage.tsx"));
    const card = read(src("pages/home/HomeProjectCard.tsx"));
    expect(page).not.toContain("HomeReadinessPanel");
    expect(card).toContain("export function HomeReadinessPanel");
  });

  it("B-04 useProjectSummary loads when sidecar online (not engineReady)", () => {
    const hook = read(src("hooks/useProjectSummary.ts"));
    expect(hook).toContain("online");
    expect(hook).not.toContain("engineReady");
  });

  it("B · Open folder button includes folder icon", () => {
    const card = read(src("pages/home/HomeProjectCard.tsx"));
    expect(card).toContain("IconOpenFolder");
    expect(card).toContain("projectOpenFolder");
    expect(card).toContain("revealInFileManager");
  });
});

describe("T-1 home gate · C quick actions", () => {
  it("C-01…C-04 routes match m01 (predict/train/filter/results)", () => {
    const source = read(src("pages/home/HomeQuickActions.tsx"));
    expect(source).toContain('path: "/predict"');
    expect(source).toContain('path: "/pipeline"');
    expect(source).toContain('path: "/results"');
    expect(source).toContain('tab: "run"');
    expect(source).toContain('tab: "filter"');
    expect(source).not.toContain('path: "/spectrogram"');
  });

  it("C · Predict page consumes location.state.tab for run/filter", () => {
    const page = read(src("pages/PredictPage.tsx"));
    expect(page).toContain("normalizePredictNavTab");
    expect(page).toContain("location.state");
    expect(page).toContain("setActiveTabState(tab)");
    expect(page).toContain("queueLoading");
  });
});

describe("T-1 home gate · D jobs + shell meta", () => {
  it("D-01 HomeRecentJobs: adaptive rows, 5 columns, CLI command without status dot", () => {
    const source = read(src("pages/home/HomeRecentJobs.tsx"));
    const visible = read(src("pages/home/homeRecentJobsVisible.ts"));
    expect(visible).toContain("HOME_RECENT_JOBS_MIN = 4");
    expect(visible).toContain("HOME_RECENT_JOBS_MAX = 14");
    expect(visible).toContain("homeRecentJobsVisibleCount");
    expect(source).toContain("homeRecentJobsVisibleCount");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("defaultDockCollapsed");
    expect(source).toContain("jobs.colCommand");
    expect(source).toContain("jobs.colTarget");
    expect(source).toContain("jobs.colStatus");
    expect(source).toContain("jobs.colDuration");
    expect(source).toContain("home.recentJobsColFinished");
    expect(source).toContain("finishedAt ? formatJobTime(finishedAt) : \"—\"");
    expect(source).toContain("jobs-command-label");
    expect(source).not.toContain("jobs-command-cell");
    expect(source).toContain("JobStatusPill");
    const css = read(src("styles/home.css"));
    // QA-L1: single scroll mode — no dock dual-mode max-height:none.
    expect(css).toContain(".home-recent-jobs");
    expect(css).toContain("max-height: min(32rem, 55cqh)");
    expect(css).not.toContain("max-height: none");
    expect(css).not.toContain('data-lab-dock="expanded"] .home-recent-jobs');
  });

  it("D-02 ShellMetaFrames visible on home and main routes", () => {
    const source = read(src("lib/shellMetaFrames.ts"));
    expect(source).toContain("return true");
    expect(source).toContain("shellMetaModelVisible");
    expect(source).toContain('focus === "recognition" || opts.focus === "full"');
  });

  it("D-03 ProjectDataHealthBanner mounted in AppShell", () => {
    const shell = read(src("layout/AppShell.tsx"));
    expect(shell).toContain("ProjectDataHealthBanner");
    expect(shell).toContain("PipelineSnippetsShortageBanner");
    const picker = read(src("lib/projectDataHealth.ts"));
    expect(picker).toContain("pickDataHealthMessage");
    expect(picker).toContain("table_stale");
    const health = read(src("components/ProjectDataHealthBanner.tsx"));
    expect(health).toContain("shrink-0");
  });
});

describe("T-1 home gate · locales + orcAI pin", () => {
  it("RU/EN home keys required by m01 exist and match", () => {
    const keys = [
      "runtimePanel",
      "runtimeSidecar",
      "runtimeEngine",
      "runtimePython",
      "runtimeAccelerator",
      "runtimeAcceleratorAvailable",
      "runtimeAcceleratorCpu",
      "runtimeEngineBundled",
      "runtimePythonBundled",
      "runtimeAutostartOff",
      "runtimeAutostartOn",
      "projectCardTitle",
      "projectOpenFolder",
      "projectTableCurrent",
      "projectTableStale",
      "projectTableMissing",
      "quickPredict",
      "trainModel",
      "quickFilter",
      "quickResults",
      "recentJobsTitle",
      "recentJobsAll",
      "recentJobsColFinished",
    ] as const;
    for (const lang of ["ru", "en"] as const) {
      const home = homeLocale(lang);
      for (const key of keys) {
        expect(home[key], `${lang}.home.${key}`).toBeTruthy();
      }
    }
  });

  it("sidecar pins orcAI v3.0.4 (engine version source of truth)", () => {
    const pyproject = read(
      resolve(root, "../sidecar/pyproject.toml"),
    );
    expect(pyproject).toContain("orcAI.git@v3.0.4");
  });
});
