import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readAnalysisLabCss } from "./readAnalysisLabCss";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(uiSrc, rel), "utf8");
}

describe("studio alignment", () => {
  it("pins Help to 10px from the panel corner", () => {
    const css = read("styles/studio.css");
    expect(css).toContain(
      ".home-page-header > .page-help-btn,\n  .projects-page-header > .page-help-btn",
    );
    expect(css).toContain(
      "transform: translate(calc(1.25rem - 10px), calc(10px - 1.25rem));",
    );
    expect(css).toContain(".predict-page-header .page-help-btn");
    expect(css).toContain(".results-page-header > .page-help-btn");
    expect(css).toContain(".models-page-header .page-help-btn");
    expect(css).toContain(".tw-header .page-help-btn");
    expect(css).toContain("transform: translate(calc(12px - 10px), 0);");
  });

  it("centers the opacity caption on the track and leaves zoom and volume centered", () => {
    const css = readAnalysisLabCss();
    expect(css).toContain("left: 50%");
    expect(css).toContain("transform: translateX(-50%)");
    expect(css).toContain(
      ".predict-logic-studio-opacity .predict-logic-slider-caption",
    );
    expect(css).toContain("left: calc(0.1rem + 0.875rem + 0.3rem)");
    expect(css).toContain("right: calc(0.1rem + 2.25rem + 0.3rem)");
  });

  it("aligns Analysis chrome with the Results button (same 8px as Filter)", () => {
    const analysis = readAnalysisLabCss();
    const params = read("styles/predict-params.css");
    const filter = read("styles/predict-filter.css");
    expect(params).toMatch(
      /\.predict-results-page-actions\s*\{[^}]*margin-right:\s*var\(--pp-params-scroll-pad-end,\s*8px\)/s,
    );
    expect(filter).toContain(
      "padding: 0 var(--pp-params-scroll-pad-end, 8px) 10px 0;",
    );
    expect(analysis).toMatch(
      /\.predict-results-stage\s*\{[\s\S]*padding:\s*0\s+var\(--pp-params-scroll-pad-end,\s*8px\)\s+0\.4rem\s+0/s,
    );
    expect(analysis).toMatch(
      /\.predict-results-stage\s*\{[\s\S]*background:\s*transparent/s,
    );
    expect(analysis).not.toMatch(
      /\.predict-results-stage\s*\{[\s\S]*background:\s*#1a1a1a/s,
    );
    expect(analysis).toMatch(
      /\.predict-results-studio\s*\{[\s\S]*scrollbar-gutter:\s*auto/s,
    );
    expect(analysis).not.toMatch(
      /\.analysis-spectrogram-studio-with-sidebar\.is-single-plot\s*\{[^}]*inset 0 0 0 1px rgb\(0 0 0 \/ 0\.45\)/s,
    );
  });

  it("keeps Analysis file name + prev/next + caret in one Исходные-style frame", () => {
    const rail = [
      read("components/SpectrogramFileSegmentRail.tsx"),
      read("components/spectrogram/SegmentRailStudioChrome.tsx"),
    ].join("\n");
    const css = readAnalysisLabCss();
    const iconsFaçade = read("components/SpectrogramIcons.tsx");
    const icons = [
      iconsFaçade,
      read("components/spectrogramIconGlyphs/index.ts"),
      read("components/spectrogramIconGlyphs/navIcons.tsx"),
    ].join("\n");
    expect(rail).toContain("analysis-segment-rail-studio-fileframe");
    expect(rail).toContain("IconSegmentPrev");
    expect(rail).toContain("IconSegmentNext");
    expect(rail).toContain("IconSegmentDown");
    expect(rail).toContain("analysis-segment-rail-studio-fileframe-caret");
    expect(rail).not.toContain("IconChevronDown");
    expect(rail).toMatch(
      /fileframe-caret[\s\S]*?<IconSegmentDown\s*\/>/,
    );
    expect(rail).not.toMatch(
      /fileframe-main[\s\S]{0,800}?cmap-caret/,
    );
    expect(rail).not.toMatch(
      /analysis-segment-rail-studio-file-end[\s\S]*analysis-segment-rail-studio-filenav/,
    );
    expect(rail).not.toContain("IconAudioFiles");
    // Façade re-exports glyphs; definitions live under spectrogramIconGlyphs/
    // (folder must not be named spectrogramIcons — macOS case collision with façade).
    expect(iconsFaçade).toContain('export * from "./spectrogramIconGlyphs"');
    expect(icons).toContain("export function IconSegmentPrev");
    expect(icons).toContain("export function IconSegmentNext");
    expect(icons).toContain("export function IconSegmentDown");
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-fileframe\s*\{[^}]*border-radius:\s*0\.75rem/s,
    );
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-labels\s*\{[^}]*border-radius:\s*0\.75rem/s,
    );
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-fileframe-wrap\s*\{[^}]*flex:\s*0 0 18rem/s,
    );
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-file-end\s+\.analysis-segment-rail-studio-labels\s*\{[^}]*margin-left:\s*auto/s,
    );
    // Colormap keeps the CSS caret; fileframe uses IconSegmentDown.
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-cmap-caret\s*\{[^}]*border-top:\s*0\.28rem\s+solid\s+currentColor/s,
    );
    expect(css).toContain("analysis-segment-rail-studio-filemenu-list");
    expect(rail).toContain("analysis-segment-rail-studio-filemenu-list");
    expect(rail).toContain("onFileMenuClose");
    // Dropdown must escape the 40px strip and paint over the plot.
    expect(css).toMatch(
      /\.analysis-segment-rail-studio-file\s*\{[^}]*overflow:\s*visible/s,
    );
    expect(css).toMatch(
      /\.predict-results-segment-panel\s*\{[^}]*z-index:\s*5/s,
    );
  });

  it("draws the reset and hand glyphs at the same size", () => {
    const icon = [
      read("components/SpectrogramIcons.tsx"),
      read("components/spectrogramIconGlyphs/zoomIcons.tsx"),
    ].join("\n");
    expect(icon).toContain(
      'transform="translate(12 12) scale(1.5) translate(-12.66 -10.13)"',
    );
    expect(icon).toContain("strokeWidth={1.45}");
    expect(icon).toMatch(
      /export function IconHand[\s\S]*strokeWidth:\s*1\.45/,
    );
    expect(icon).not.toMatch(
      /export function IconHand[\s\S]*strokeWidth:\s*2\.25/,
    );
    const player = [
      read("components/SpectrogramAudioPlayer.tsx"),
      read("components/spectrogram/SpectrogramAudioStudioControls.tsx"),
    ].join("\n");
    expect(player).toContain('className="predict-logic-sliders-reset-btn"');
    expect(player).toContain("<IconCircularReset size={22} />");
    expect(player).toContain("<IconHand size={22} />");
    const css = readAnalysisLabCss();
    expect(css).toContain(
      ".predict-logic-studio-view-tools .predict-logic-transport-btn svg",
    );
    expect(css).toContain("width: 1.4rem");
    expect(css).not.toContain(".predict-logic-sliders-reset-btn svg");
    expect(css).toContain(
      ".predict-logic-hand-btn:not([aria-pressed=\"true\"])",
    );
    expect(css).not.toContain("#f2f2f2");
    expect(css).not.toMatch(
      /predict-logic-hand-btn[^}]*drop-shadow/s,
    );
  });

  it("points the pipeline manual hint at the parameter file", () => {
    const ru = JSON.parse(read("../public/locales/ru/ru.json")) as {
      pipeline: { manualHint: string };
    };
    const en = JSON.parse(read("../public/locales/en/en.json")) as {
      pipeline: { manualHint: string };
    };
    expect(ru.pipeline.manualHint).toBe(
      "или запускайте шаги вручную — сначала проверьте orcai_parameter.json в «Параметрах проекта»",
    );
    expect(en.pipeline.manualHint).toBe(
      "or run steps by hand — check orcai_parameter.json in Project parameters first",
    );
  });
});
