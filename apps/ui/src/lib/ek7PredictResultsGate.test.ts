import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const src = (...parts: string[]) => resolve(root, "src", ...parts);
const sidecar = (...parts: string[]) =>
  resolve(root, "..", "sidecar", "src", "orcai_desktop_sidecar", ...parts);
const locale = (lang: "ru" | "en") =>
  resolve(root, `public/locales/${lang}/${lang}.json`);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("T-4 predict analysis gate · requirements", () => {
  it("1. studio tab is scientific + studioChrome; tiles are display_kind=orcai gray", () => {
    const panel = read(src("components/PredictResultsTabPanel.tsx"));
    expect(panel).toContain('layout="scientific"');
    expect(panel).toContain("studioChrome");
    expect(panel).toContain("PredictResultsToolbar");
    expect(panel).toContain("showSpectrogram");
    expect(panel).toContain("is-table-hero");

    const view = read(src("lib/spectrogramView.ts"));
    expect(view).toMatch(
      /export const SPECTROGRAM_DISPLAY_KIND = "orcai"/,
    );
    expect(view).toContain("SPECTROGRAM_SEGMENT_SEC = 200");

    const viewer = read(src("components/SpectrogramViewer.tsx"));
    expect(viewer).toContain("spectrogram_colormap");
    expect(viewer).toContain("updateProject");
    expect(viewer).not.toContain("notifySaved");
    expect(viewer).toContain("onColormapChange={setColormap}");
    expect(viewer).not.toContain('const colormap = isScientific ? "gray"');
    expect(viewer).toContain("hideColormap={isScientific}");
    expect(viewer).toContain("display_kind: SPECTROGRAM_DISPLAY_KIND");
    expect(viewer).toContain("showSpectrogram");
    expect(viewer).toContain("fileNavOnly={!showSpectrogram}");
    expect(viewer).toContain("PredictResultsClassesFilterModal");
    expect(viewer).toContain("onClassesFilterToggle");
    expect(viewer).toContain("showSpectrogram || !studioChrome");
    expect(viewer).toContain("if (!showSpectrogram) return;");
    expect(viewer).not.toMatch(/display_kind:\s*"linear"/);
    expect(viewer).not.toMatch(/display_kind:\s*"log_mel"/);
  });

  it("2. sidecar tiles are make_spectrogram, 0–16 kHz, quantiles 0.01–0.999", () => {
    const adapter = read(sidecar("adapters", "spectrogram.py"));
    expect(adapter).toContain("from orcai.spectrogram import make_spectrogram");
    expect(adapter).toContain("source\": \"make_spectrogram\"");

    const render = read(sidecar("adapters", "spectrogram_render.py"));
    expect(render).toContain("ORCAI_VIEW_FMAX_HZ = 16_000.0");
    expect(render).toContain("ORCAI_DEFAULT_QUANTILES = (0.01, 0.999)");
    expect(render).toContain("normalize_display_kind");
    expect(render).toMatch(/kind in \{"orcai".*"log_mel"/);

    const axis = read(src("lib/spectrogramAxis.ts"));
    expect(axis).toContain("ORCAI_DEFAULT_AXIS_MAX_HZ = 16_000");
  });

  it("3. table ↔ spectrogram sync is bidirectional via focusDetection", () => {
    const viewer = read(src("components/SpectrogramViewer.tsx"));
    expect(viewer).toContain("onRowActivate={(row) => focusDetection(row.t0, row.t1, row.label)}");
    expect(viewer).toContain("focusDetection(t0, t1, seg.label)");
    expect(viewer).toContain("setSelectedSegment");

    const table = read(src("components/SpectrogramDetectionsTable.tsx"));
    expect(table).toContain("onRowActivate(row)");
    expect(table).toContain("studioLayout");

    const detections = read(src("lib/spectrogramDetections.ts"));
    expect(detections).toContain("findDetectionRowForSelection");
    expect(detections).toContain("detectionRowMatchesSelection");
    expect(detections).toContain("scrollElementIntoScroller");
    expect(read(src("lib/spectrogramOverlayHit.ts"))).toContain(
      "export function hitOverlaySegment",
    );
  });

  it("4. class rail uses codes + Paul Tol palette; type column is publication names", () => {
    const colors = read(src("lib/labelColors.ts"));
    expect(colors).toContain('whistles: "#AA4499"');
    expect(colors).toContain('buzzing: "#117733"');
    expect(colors).toContain('"prey handling sounds": "#88CCEE"');
    expect(colors).toContain('"pulsed calls": "#DDCC77"');
    expect(colors).toContain('breathing: "#332288"');
    expect(colors).toContain('"herding calls": "#44AA99"');
    expect(colors).toContain('"tail slaps": "#CC6677"');
    expect(colors).toContain('whistles: "WHISTLE"');

    const sidebar = read(src("components/PredictResultsClassSidebar.tsx"));
    expect(sidebar).toContain("formatDetectionClassCode");
    expect(sidebar).toContain("modelClasses");
    expect(sidebar).toContain("classFilterRows");
    expect(sidebar).not.toContain("PUBLICATION_LABEL_ORDER");
    expect(sidebar).toContain("onToggle");
    expect(sidebar).toContain("is-empty");

    const overlay = read(src("components/SpectrogramOverlay.tsx"));
    expect(overlay).toContain("if (hiddenLabels.has(seg.label)) return false");

    const table = read(src("components/SpectrogramDetectionsTable.tsx"));
    expect(table).toContain("formatDetectionClassCode");
    expect(table).toContain("formatDetectionTypeLabel");
    expect(table).toMatch(/STUDIO_VISIBLE[\s\S]*class: true[\s\S]*type: true/);
  });

  it("5. studio table columns cover (start/end/duration/class/type/probability/file)", () => {
    const table = read(src("components/SpectrogramDetectionsTable.tsx"));
    expect(table).toMatch(
      /STUDIO_VISIBLE: Record<DetectionColumnId, boolean> = \{[\s\S]*time: true[\s\S]*end: true[\s\S]*duration: true[\s\S]*class: true[\s\S]*type: true[\s\S]*confidence: true[\s\S]*file: true/,
    );
    const ru = JSON.parse(read(locale("ru"))) as {
      spectrogram: { detections: Record<string, string> };
    };
    expect(ru.spectrogram.detections.colDurationHeader).toBe("Длительность");
    expect(ru.spectrogram.detections.colClassHeader).toBe("Класс");
    expect(ru.spectrogram.detections.colConfidenceHeader).toBe("Вероятность");
  });

  it("6. expanded dock uses cqh; spectrogram/table stay capped (Т-4 console)", () => {
    const css = read(src("styles/analysis-lab.css"));
    expect(css).toContain("container-name: studio-results");
    expect(css).toContain("max-height: min(32rem, 52cqh)");
    expect(css).toContain("28cqh");
    expect(css).toContain(".predict-results-class-sidebar");
    expect(css).toMatch(
      /\.predict-results-class-sidebar\s*\{[\s\S]*overflow-y:\s*auto/,
    );
    expect(css).toContain(
      ".predict-results-studio.is-table-hero .analysis-spectrogram-studio-stack",
    );
    expect(css).toMatch(
      /\.predict-results-studio\.is-table-hero\s+\.analysis-spectrogram-studio-stack\s*\{[\s\S]*display:\s*none/,
    );
    expect(css).toMatch(
      /\.predict-results-studio\.is-table-hero\s+\.predict-results-stage\s*\{[\s\S]*min-height:\s*0/,
    );
    expect(css).toContain(
      ".analysis-segment-rail-studio.is-file-nav-only .analysis-segment-rail-studio-head",
    );
  });

  it("7. tab + crumb are Анализ / Analysis; nav Results section stays Результаты", () => {
    const page = read(src("pages/PredictPage.tsx"));
    expect(page).toContain('t("predict.tabs.results")');
    expect(page).toContain('activeTab === "results"');
    expect(page).toContain("PredictResultsTabPanel");

    const ru = JSON.parse(read(locale("ru"))) as {
      predict: { tabs: { results: string } };
      nav: { results: string };
      pages: { results: { title: string } };
    };
    const en = JSON.parse(read(locale("en"))) as {
      predict: { tabs: { results: string } };
      nav: { results: string };
    };
    expect(ru.predict.tabs.results).toBe("Анализ");
    expect(en.predict.tabs.results).toBe("Analysis");
    expect(ru.nav.results).toBe("Результаты");
    expect(en.nav.results).toBe("Results");
    expect(ru.pages.results.title).toBe("Результаты");
  });

  it("7b. QA-08: single analysis-spectrogram-studio-host (panel only, not pane wrap)", () => {
    const pane = read(src("components/PredictAnalysisSpectrogramPane.tsx"));
    const panel = read(src("components/PredictSpectrogramPanel.tsx"));
    expect(pane).not.toContain("analysis-spectrogram-studio-host");
    expect(panel).toContain("analysis-spectrogram-studio-host");
    // Nested host was pane wrap + panel section; pane must stay fragment/hint only.
    expect(pane).toContain("<>");
  });

});
