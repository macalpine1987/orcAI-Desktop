import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const styles = join(here, "..", "styles");
const srcRoot = join(here, "..");

describe("TZ-layout-scale · container contract", () => {
  it("app-viewport is a size container and clamps the expanded dock in cqh", () => {
    const css = readFileSync(join(srcRoot, "index.css"), "utf8");
    expect(css).toMatch(/\.app-viewport\s*\{[^}]*container-type:\s*size/s);
    expect(css).toMatch(/\.app-viewport\s*\{[^}]*position:\s*absolute/s);
    expect(css).toContain("width: calc(100% / var(--ui-zoom, 1))");
    expect(css).toMatch(
      /--m16-dock-h:\s*clamp\(\s*10rem,\s*38cqh,\s*17\.5rem\s*\)/,
    );
  });

  it("jobs-console does not pin the dock to a fixed 17.5rem", () => {
    const css = readFileSync(join(styles, "jobs-console.css"), "utf8");
    expect(css).not.toMatch(/--m16-dock-h:\s*17\.5rem/);
    expect(css).toContain("container-name: studio-work");
  });

  it("predict work panel and params queue use container units, not vh", () => {
    const css = readFileSync(join(styles, "predict-params.css"), "utf8");
    expect(css).toMatch(/\.predict-work-panel\s*\{[^}]*container-type:\s*size/s);
    expect(css).toContain("max-height: min(26rem, 50cqh)");
    expect(css).toMatch(/\.pp-params-layout\s*\{[^}]*min-height:\s*12rem/s);
    expect(css).toMatch(/\.predict-panel-body\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).not.toMatch(/\.pp-queue-table-wrap[\s\S]*?50vh/);
    // Preset strip and the two cards share the studio container, not the window.
    expect(css).toContain("@container studio-work (min-width: 960px)");
    expect(css).not.toMatch(/@media \(min-width: 960px\)/);
    expect(css).toContain(".predict-presets-bar--toolbar {\n    grid-column: 2;");
    expect(css).toMatch(/\.predict-presets-bar--toolbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(css).not.toMatch(/predict-presets-bar--toolbar[\s\S]*width:\s*calc\(/);
  });

  it("Results spectrogram and detections size from cqh, not window vh", () => {
    const css = readFileSync(join(styles, "analysis-lab.css"), "utf8");
    expect(css).toContain("container-name: studio-results");
    expect(css).toContain("max-height: min(32rem, 52cqh)");
    expect(css).toContain("28cqh");
    expect(css).not.toMatch(/34vh/);
    expect(css).not.toMatch(/22vh/);
    expect(css).not.toMatch(
      /\.predict-results-stage \.analysis-spectrogram-studio-with-sidebar\s*\{[^}]*max-height:\s*none/s,
    );
    // Toast is chrome in the studio column — must not flex-shrink away.
    expect(css).toMatch(
      /\.predict-results-toast\s*\{[^}]*flex:\s*0\s*0\s*auto/s,
    );
  });

  it("Home and Projects work panels are size containers", () => {
    const home = readFileSync(join(styles, "home.css"), "utf8");
    const projects = readFileSync(join(styles, "projects-studio.css"), "utf8");
    expect(home).toMatch(/\.home-work-panel\s*\{[^}]*container-type:\s*size/s);
    expect(projects).toContain("container-name: studio-work");
  });

  it("UI scale lays the shell out in 100%/zoom so the dock is not painted off-screen", () => {
    const css = readFileSync(join(srcRoot, "index.css"), "utf8");
    const settings = readFileSync(join(styles, "settings-interface.css"), "utf8");
    const help = readFileSync(join(styles, "help-studio.css"), "utf8");
    expect(css).toContain("width: calc(100% / var(--ui-zoom, 1))");
    expect(css).toMatch(/\.app-viewport\s*\{[^}]*position:\s*absolute/s);
    expect(settings).toContain("@container studio-work (min-width: 40rem)");
    expect(settings).not.toMatch(
      /@media \(min-width: 900px\) \{\s*\.settings-interface-layout/,
    );
    expect(help).toContain("@container studio-work (max-width: 42rem)");
  });

  it("UI Scale still applies CSS zoom, not transform scale", () => {
    const ts = readFileSync(join(srcRoot, "lib/uiScale.ts"), "utf8");
    expect(ts).toContain("style.zoom");
    expect(ts).not.toContain("transform");
  });

  it("real shell reapplies zoom after the preferences placeholder", () => {
    const app = readFileSync(join(srcRoot, "App.tsx"), "utf8");
    expect(app).toMatch(
      /useLayoutEffect\(\(\) => \{\s*applyUiScale\(resolveUiScaleFactor\(uiScale\)\);/s,
    );
  });

  it("snippet calculator headers keep a full column width", () => {
    const css = readFileSync(join(styles, "train-wizard.css"), "utf8");
    expect(css).toMatch(/\.tw-calc-modal\s*\{[^}]*width:\s*min\(72rem,\s*calc\(100vw - 2\.5rem\)\)/s);
    expect(css).toMatch(
      /\.tw-calc-modal \.jobs-table-body \.jobs-table\s*\{[^}]*table-layout:\s*auto/s,
    );
    expect(css).toMatch(
      /\.tw-calc-modal \.jobs-table th\s*\{[^}]*white-space:\s*nowrap/s,
    );
    expect(css).toMatch(/\.tw-calc-modal \.tw-col-num\s*\{[^}]*min-width:\s*9\.75rem/s);
  });

  it("wizard and monitor modals cap height with vh, not a size container", () => {
    const wizard = readFileSync(join(styles, "train-wizard.css"), "utf8");
    const monitor = readFileSync(join(styles, "train-monitor.css"), "utf8");
    expect(wizard).toMatch(
      /\.tw-syn-modal\s*\{[^}]*max-height:\s*min\(36rem,\s*calc\(100vh - 3rem\)\)/s,
    );
    expect(monitor).not.toMatch(/\.tm-modal\s*\{[^}]*container-type:\s*size/s);
  });
});
