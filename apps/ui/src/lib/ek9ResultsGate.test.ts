import { existsSync, readFileSync } from "node:fs";
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

describe("T-6 results studio gate · / m06", () => {
  it("1. sidecar summary has predicted, filtered and annotations sources", () => {
    const adapter = read(sidecar("adapters", "results_summary.py"));
    expect(adapter).toContain('Literal["predicted", "filtered", "annotations"]');
    expect(adapter).toContain("is_predicted_label_name");
    expect(adapter).toContain("is_filtered_label_name");
    expect(adapter).toContain("is_annotation_label_name");
    expect(adapter).toContain('source == "annotations"');
    expect(adapter).toContain("files_failed");
    expect(adapter).toContain("one bad label file must not fail the summary");
    expect(adapter).not.toContain("_MAX_FILES");
    expect(adapter).not.toContain("_MAX_ROWS");
    expect(adapter).not.toContain("mean_p * 1.");

    const main = read(sidecar("main.py"));
    expect(main).toContain("/v1/results/summary");
    expect(main).toContain("predicted, filtered, or annotations");
  });

  it("2. studio matches m06 chrome: pills, 5 KPIs, class chart, table bars", () => {
    const studio = read(src("components", "ResultsStudio.tsx"));
    expect(studio).toContain('"predicted", "filtered", "annotations"');
    expect(studio).toContain("kpiDetections");
    expect(studio).toContain("kpiFiles");
    expect(studio).toContain("kpiDuration");
    expect(studio).toContain("kpiMeanP");
    expect(studio).toContain("kpiThreshold");
    expect(studio).not.toContain("kpiModel");
    expect(studio).toContain("results-class-chart");
    expect(studio).toContain("is-muted");
    expect(studio).toContain("--rs-class-n");
    const css = read(src("styles", "results-studio.css"));
    expect(css).toContain("--rs-class-n");
    expect(css).toContain("width: 0");
    expect(css).toContain("text-overflow: ellipsis");
    expect(studio).toContain("results-prob-fill");
    expect(studio).toContain("colSource");
    expect(studio).toContain("openRow");
    expect(studio).toContain("filterSearch");
    expect(studio).toContain("filterMinProb");
    expect(studio).toContain("onOpenDetection");
    expect(studio).toContain("DEFAULT_RESULTS_SORT");
    expect(studio).toContain("predict-results-page-btn--filled");
    expect(studio).toContain("predict-tabs-m03");
    expect(studio).toContain("predict-tab");
    expect(studio).toContain("summarizeResultsRows");
    expect(studio).toContain("view.detection_count");
    expect(studio).not.toContain("data.summary.detection_count");

    const lib = read(src("lib", "resultsStudio.ts"));
    expect(lib).toContain('key: "recording", dir: "asc"');
    expect(lib).toContain("export function summarizeResultsRows");
    expect(lib).toContain("export function seedResultsMinProb");
    expect(lib).toContain("export function classChartColumns");
    expect(lib).toContain('source !== "predicted"');

    const page = read(src("pages", "ResultsPage.tsx"));
    expect(page).toContain('tab: "results"');
    expect(page).toContain("focusStartSec");
    expect(page).toContain("focusEndSec");
    expect(page).toContain("rowsToCsv");
    expect(page).toContain("rowsToAudacityText");
    expect(page).toContain("useWorkspace");
    expect(page).toContain("summary.source === source");
    expect(page).toContain("setSummary(null)");
    expect(page).toContain("projects.engineRequired");
    expect(page).not.toContain("tabMetrics");
    expect(studio).toContain("results.truncated");
    expect(studio).toContain("results.filesFailed");
  });

  it("3. row click wires focusNav through Predict analysis", () => {
    const predict = read(src("pages", "PredictPage.tsx"));
    expect(predict).toContain("focusStartSec");
    expect(predict).toContain("setAnalysisFocus");
    expect(predict).toContain("focusNav={");
    expect(predict).toContain("analysisFocus");
    expect(predict).toContain("shouldKeepNavLabelOverride");

    const panel = read(src("components", "PredictSpectrogramPanel.tsx"));
    expect(panel).toContain("focusNav={focusNav}");

    const viewer = read(src("components", "SpectrogramViewer.tsx"));
    // Call via ref so segment-chevron / viewStart churn does not re-snap focusNav.
    expect(viewer).toContain("focusDetectionRef.current(focusNav.t0, focusNav.t1, focusNav.label)");
    expect(viewer).toContain("focusDetectionRef.current = focusDetection");
  });

  it("4. locales and mockup file exist", () => {
    const ru = JSON.parse(read(locale("ru"))) as {
      results: Record<string, unknown>;
      pages: { results: { description: string } };
    };
    const en = JSON.parse(read(locale("en"))) as {
      results: Record<string, unknown>;
    };
    expect(ru.pages.results.description).toContain("сверка с аннотациями");
    expect(ru.results.source).toEqual({
      predicted: "Распознанные",
      filtered: "После фильтра",
      annotations: "Аннотации",
    });
    expect(en.results.source).toEqual({
      predicted: "Predicted",
      filtered: "Filtered",
      annotations: "Annotations",
    });
    expect(ru.results.kpiFiles).toBe("Файлов");
    expect(ru.results.openRow).toBe("Открыть");
    expect(String(ru.results.truncated)).toContain("первые");
    expect(String(ru.results.filesFailed)).toContain("Пропущены");

    const mockup = resolve(
      root,
      "..",
      "..",
      "docs",
      "cursor-handoff",
      "mockups",
      "m06-results.png",
    );
    expect(existsSync(mockup)).toBe(true);
  });

  it("5. T-6 regression suite covers summary, filters, export, nav and source switch", () => {
    const studioTest = read(src("components", "ResultsStudio.test.tsx"));
    expect(studioTest).toContain("T-6.1");
    expect(studioTest).toContain("T-6.2");
    expect(studioTest).toContain("T-6.3");
    expect(studioTest).toContain("T-6.4");
    expect(studioTest).toContain("T-6.5");
    expect(studioTest).toContain("BR-002");
    expect(studioTest).toContain("BR-004/005");
    expect(studioTest).toContain("BR-007");
    expect(studioTest).toContain("KPI strip and class chart follow");
    expect(studioTest).toContain("is-muted");

    const pageTest = read(src("pages", "ResultsPage.test.tsx"));
    expect(pageTest).toContain("T-6.1");
    expect(pageTest).toContain("T-6.4");
    expect(pageTest).toContain("T-6.5");
    expect(pageTest).toContain("BR-003");
    expect(pageTest).toContain("BR-006");
    expect(pageTest).toContain("BR-008");
    expect(pageTest).toContain("saveWorkspace");
  });
});
