import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = (...parts: string[]) => resolve(root, "src", ...parts);
const locale = (lang: "ru" | "en") =>
  resolve(root, `public/locales/${lang}/${lang}.json`);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      for (const sub of flatten(v as Record<string, unknown>, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

function studioKeys(lang: "ru" | "en"): Set<string> {
  const json = JSON.parse(read(locale(lang))) as { projects: { studio: Record<string, unknown> } };
  return flatten(json.projects.studio);
}

describe("T-2 projects gate · requirements", () => {
  it("1. four tabs: Записи · Аннотации · Артефакты · Параметры (field focus hides two)", () => {
    const lib = read(src("lib/projectsStudio.ts"));
    expect(lib).toMatch(/"recordings",\s*"annotations",\s*"artifacts",\s*"parameters"/);
    expect(lib).toContain("projectsTabsForFocus");
    expect(lib).toMatch(/focus === "recognition"/);
    const page = read(src("pages/ProjectsPage.tsx"));
    for (const c of [
      "ProjectRecordingsTab",
      "ProjectAnnotationsTab",
      "ProjectArtifactsTab",
      "ProjectParametersTab",
      "ProjectTabs",
      "projectsTabsForFocus",
    ]) {
      expect(page).toContain(c);
    }
    const tabs = read(src("components/projects/ProjectTabs.tsx"));
    expect(tabs).toContain("predict-tabs-m03");
    expect(tabs).toContain("predict-tab");
  });

  it("2. m32 wizard: three soft-focus cards, focus stored via API (SQLite), not manifest", () => {
    const wizard = read(src("components/projects/ProjectCreateWizard.tsx"));
    expect(wizard).toContain("PROJECT_FOCUSES");
    expect(wizard).toContain("ps-focus-card");
    expect(wizard).toContain("projects.studio.wizard.next");
    const page = read(src("pages/ProjectsPage.tsx"));
    expect(page).toMatch(/createProject\(\{[\s\S]*?focus: wizardFocus/);
    expect(page).not.toContain("project_kind: projectKind");
  });

  it("2b. FR-2.17: no hard lock by project kind in nav / routes / palette", () => {
    const kind = read(src("lib/projectKind.ts"));
    expect(kind).not.toContain("navAllowedForProjectKind");
    expect(kind).not.toContain("isRouteAllowedForProjectKind");
    expect(read(src("layout/AppShell.tsx"))).not.toContain("navAllowedForProjectKind");
    expect(read(src("components/CommandPalette.tsx"))).not.toContain("navAllowedForProjectKind");
    expect(read(src("components/RuntimeRouteGuard.tsx"))).not.toContain(
      "isRouteAllowedForProjectKind",
    );
    expect(read(src("layout/navigation.ts"))).toContain("pipelineNavInactive");
    expect(read(src("layout/AppShell.tsx"))).toContain("pipelineNavInactive");
  });

  it("3. m36 readiness panel: five cards + next steps + full-cycle line", () => {
    const panel = read(src("components/projects/ProjectReadinessPanel.tsx"));
    expect(panel).toContain("READINESS_CARD_KEYS");
    expect(panel).toContain("nextStepsFromSummary");
    expect(panel).toContain("isFullCycleReady");
    expect(panel).toContain("projects.studio.readiness.fullCycleReady");
    const lib = read(src("lib/projectsStudio.ts"));
    expect(lib).toMatch(/"recordings",\s*"annotations",\s*"predict",\s*"datasets",\s*"model"/);
    expect(lib).toContain('tab: "filter"');
    const page = read(src("pages/ProjectsPage.tsx"));
    expect(page).toContain('step.action === "filter"');
    expect(page).toContain('openPredict("filter")');
  });

  it("4. m33 empty state: add WAV + drop (refresh / open folder on top bar)", () => {
    const tab = read(src("components/projects/ProjectRecordingsTab.tsx"));
    expect(tab).toContain("projects.studio.empty.title");
    expect(tab).toContain("projects.studio.empty.steps");
    expect(tab).toContain("projects.studio.empty.dropHint");
    expect(tab).toContain("projects.studio.actions.addWav");
    expect(tab).toContain("onImportWavPaths");
    expect(tab).toContain("useWavDropZone");
    expect(tab).toContain("projects.studio.actions.refreshTable");
    expect(tab).toContain("onRefreshTable");
    expect(tab).not.toContain("projects.studio.actions.openCatalog");
    const bar = read(src("components/projects/ProjectsActionsBar.tsx"));
    expect(bar).not.toContain("projects.studio.actions.refreshTable");
    expect(bar).toContain("projects.studio.actions.projectList");
    expect(bar).toContain("IconProjectsList");
    expect(read(src("components/projects/ProjectListModal.tsx"))).toContain("ProjectListModal");
    expect(bar).toContain("projects.studio.actions.openFolder");
    expect(bar).not.toContain("projects.studio.actions.openExisting");
    expect(bar).not.toContain("onOpenExisting");
  });

  it("5. recordings tab: original CSV columns untranslated, channel editable, 96 kHz mark", () => {
    const tab = read(src("components/projects/ProjectRecordingsTab.tsx"));
    expect(tab).toContain("table.columns.filter");
    expect(tab).toContain("ps-channel-input");
    expect(tab).toContain("onChannelChange(row.recording");
    expect(tab).toContain("resample_to_hz");
    expect(tab).toContain("projects.studio.table.resampleNote");
    const api = read(src("api/projects.ts"));
    expect(api).toContain("setProjectRecordingChannel");
    expect(api).toContain("/recording-table/rows/");
  });

  it("6. refresh table is explicit with confirmation (-ut -up)", () => {
    const dialogs = read(src("components/projects/ProjectDialogs.tsx"));
    expect(dialogs).toContain("RefreshTableDialog");
    expect(dialogs).toContain('"merge" : "create"');
    expect(dialogs).toContain('"rebuild"');
    const ru = JSON.parse(read(locale("ru"))) as {
      projects: { studio: { confirmRefresh: { bodyUpdate: string } } };
    };
    expect(ru.projects.studio.confirmRefresh.bodyUpdate).toContain("-ut -up");
  });

  it("7. annotations tab labels masked classes in the UI", () => {
    const tab = read(src("components/projects/ProjectAnnotationsTab.tsx"));
    expect(tab).toContain("projects.studio.annotations.maskNote");
    expect(tab).toContain("onAddAnnotations");
    expect(tab).toContain("useAnnotationDropZone");
    expect(tab).toMatch(/v == null/);
    const api = read(src("api/projects.ts"));
    expect(api).toContain("/annotations/import");
    const ru = JSON.parse(read(locale("ru"))) as {
      projects: { studio: { annotations: { maskNote: string; add: string } } };
    };
    expect(ru.projects.studio.annotations.maskNote).toContain("замаскирован");
    expect(ru.projects.studio.annotations.add).toContain("аннотац");
  });

  it("8. artifacts tab: files, size, updated, open", () => {
    const tab = read(src("components/projects/ProjectArtifactsTab.tsx"));
    for (const k of ["dir", "files", "size", "updated", "open", "footer"]) {
      expect(tab).toContain(`projects.studio.artifacts.${k}`);
    }
    expect(tab).toContain("onOpen(item.path)");
  });

  it("9. parameters tab: validate / save / revert / export", () => {
    const tab = read(src("components/projects/ProjectParametersTab.tsx"));
    expect(tab).toContain("onValidate(debounced)");
    expect(tab).toContain("projects.studio.params.save");
    expect(tab).toContain("projects.studio.params.cancel");
    expect(tab).toContain("projects.studio.params.export");
    const api = read(src("api/projects.ts"));
    expect(api).toContain("/parameters/validate");
    expect(api).toContain("saveProjectParameters");
  });

  it("10. field / lab focus: predict and train both reachable", () => {
    const ann = read(src("components/projects/ProjectAnnotationsTab.tsx"));
    expect(ann).toContain("projects.studio.empty.labHint");
    const page = read(src("pages/ProjectsPage.tsx"));
    expect(page).toContain("projects.studio.actions.predict");
    expect(page).toContain("projects.studio.actions.trainWizard");
    expect(read(src("components/projects/ProjectTabs.tsx"))).toContain("ps-tabs-trailing");
    expect(page).toContain('navigate("/pipeline")');
    expect(page).toContain('navigate("/predict"');
  });

  it("RU/EN studio strings are in sync and the legacy accordion is gone", () => {
    expect(studioKeys("ru")).toEqual(studioKeys("en"));
    expect(existsSync(src("components/ProjectListAccordion.tsx"))).toBe(false);
    expect(read(src("index.css"))).toContain("projects-studio.css");
  });

  it("Projects sits in the same studio-panel frame as Home (m01 rim)", () => {
    const page = read(src("pages/ProjectsPage.tsx"));
    expect(page).toContain('className="studio-panel projects-work-panel"');
    expect(page).toContain('"projects-panel-body"');
    expect(page).toContain('view === "wizard" && "projects-panel-body--wizard"');
    expect(page).toContain("projects-panel-body--project");
    expect(page).toContain("projects-panel-body--empty");
    expect(page).toContain("ps-project-stage");
    expect(page).not.toContain("headerExpanded");
    const shell = read(src("layout/AppShell.tsx"));
    expect(shell).toContain('location.pathname === "/projects"');
    expect(shell).toContain("app-viewport--projects-studio");
    expect(shell).toContain("mat-shell-main--projects-studio");
    const css = read(src("styles/projects-studio.css"));
    expect(css).toContain(".app-viewport--projects-studio .projects-work-panel.studio-panel");
    expect(css).toContain("border: 1px solid var(--m16-chrome-border)");
    expect(css).toContain(".projects-panel-body--wizard");
    expect(css).toContain(".projects-panel-body--empty");
    expect(css).toContain(".ps-project-stage");
    expect(css).not.toContain("max-width: 64rem");
    expect(css).toMatch(/\.ps-wizard-actions\s*\{[^}]*margin-top:\s*auto/s);
    expect(css).toMatch(/\.ps-wizard\s*\{[^}]*background:\s*var\(--mat-raised\)/s);
    expect(css).toMatch(/\.ps-focus-card-cmd\s*\{[^}]*color:\s*#7dffa3/s);
    expect(css).not.toMatch(/\.ps-focus-card-cmd\s*\{[^}]*color:\s*var\(--text-muted\)/s);
    const focusCard = css.match(/\.ps-focus-card\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(focusCard).toContain("background: #191a1b");
    expect(focusCard).toContain("border: 1px solid #2a2c2f");
    expect(focusCard).not.toContain("color-mix(in srgb, var(--mat-raised)");
  });

  it("no-project landing: one composition, toolbar hidden, no duplicate Create", () => {
    const page = read(src("pages/ProjectsPage.tsx"));
    expect(page).toContain("ProjectNoSelectionEmpty");
    expect(page).toMatch(/\{detail \? \([\s\S]*ProjectsActionsBar/);
    const welcome = read(src("components/projects/ProjectNoSelectionEmpty.tsx"));
    expect(welcome).toContain("ps-welcome-path");
    expect(welcome).toContain("pathCreateTitle");
    expect(welcome).toContain("pathOpenTitle");
    expect(welcome).toContain("m-projects-no-selection-welcome.png");
    expect(
      existsSync(
        resolve(root, "..", "..", "docs", "cursor-handoff", "mockups", "m-projects-no-selection-welcome.png"),
      ),
    ).toBe(true);
    for (const lang of ["ru", "en"] as const) {
      const keys = studioKeys(lang);
      expect(keys.has("empty.pathCreateTitle")).toBe(true);
      expect(keys.has("empty.pathOpenTitle")).toBe(true);
      expect(keys.has("empty.welcomeEyebrow")).toBe(true);
    }
  });
});
