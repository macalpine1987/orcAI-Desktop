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

describe("T-5 predict filter gate · requirements", () => {
  it("1. limits editor has default + class rows with empty min/max as null", () => {
    const studio = read(src("components/PredictFilterStudio.tsx"));
    expect(studio).toContain('{ key: "default", isDefault: true');
    expect(studio).toContain("FILTER_CLASS_ORDER");
    expect(studio).toContain("inputToBound");
    expect(studio).toContain("serializeLimitsJson");

    const lib = read(src("lib/callDurationLimits.ts"));
    expect(lib).toContain("Empty min");
    expect(lib).toContain("inputToBound");
    expect(lib).toMatch(/if \(trimmed === ""\) return null/);
    const inputToBoundFn = lib.match(
      /export function inputToBound[\s\S]*?\nexport function /,
    )?.[0];
    expect(inputToBoundFn).toBeTruthy();
    expect(inputToBoundFn).not.toMatch(/return 0/);
    expect(lib).not.toMatch(/if \(!\(code in out\)\) out\[code\] = \[null, null\]/);
  });

  it("2. live preview uses orcAI _check_duration and never writes filtered txt", () => {
    const preview = read(sidecar("adapters", "filter_preview.py"));
    expect(preview).toContain("from orcai.predict import _check_duration");
    expect(preview).toContain("_check_duration(row, call_duration_limits, 1, label_suffix)");
    expect(preview).toContain("original files are not touched");
    expect(preview).not.toContain("to_csv");
    expect(preview).not.toContain("filter_predictions_file");

    const main = read(sidecar("main.py"));
    expect(main).toContain("/v1/filter-predictions/preview");
    expect(main).toContain("preview_filter_predictions");
  });

  it("3. apply writes *_predicted_filtered.txt via filter-predictions + -cdl", () => {
    const page = read(src("pages/PredictPage.tsx"));
    expect(page).toContain('createJob("filter-predictions"');
    expect(page).toContain("call_duration_limits: limitsJsonPath");
    expect(page).toContain("onApply={onRunFilter}");

    const adapter = read(sidecar("adapters", "predict.py"));
    expect(adapter).toContain("resolve_filtered_output_path");
    expect(adapter).toContain('f"{path.stem}_filtered.txt"');

    const lib = read(src("lib/callDurationLimits.ts"));
    expect(lib).toContain("${dir}${stem}_filtered.txt");
  });

  it("4. load/save JSON is portable; default [0,null] warns; publication example is opt-in", () => {
    const studio = read(src("components/PredictFilterStudio.tsx"));
    expect(studio).toContain("onLoad");
    expect(studio).toContain("onSave");
    expect(studio).toContain('notifySaved(t("predict.filterStudio.saved"))');
    expect(studio).toContain("ORCAI_V1_PUBLICATION_LIMITS");
    expect(studio).toContain("ORCAI_DEFAULT_DURATION_LIMITS");
    expect(studio).toContain("isNoOpDurationLimits");
    expect(studio).toContain("predict.filterStudio.defaultWarn");
    expect(studio).toContain("predict.filterStudio.publication");
    expect(studio).toContain("predict-filter-m05-limits-title-row");
    expect(studio).toContain("predict-filter-m05-tool");

    const lib = read(src("lib/callDurationLimits.ts"));
    expect(lib).toContain("BR: [0.4, null]");
    expect(lib).toContain("WHISTLE: [0.1, null]");
  });

  it("5. histogram is per selected class; duration is brushed on the preview plot", () => {
    const studio = read(src("components/PredictFilterStudio.tsx"));
    expect(studio).toContain("durationHistogram");
    expect(studio).toContain('selectedClass === "default"');
    expect(studio).toContain("applyAll");
    expect(studio).toContain("predict.filterStudio.cliTimes");
    expect(studio).toContain("PredictFilterHistogram");
    expect(studio).toContain("PredictFilterTrackToolbar");
    expect(studio).toContain("predict-filter-m05-right");
    expect(studio).toContain("setPair");

    const hist = read(src("components/PredictFilterHistogram.tsx"));
    expect(hist).toContain("onPointerDown");
    expect(hist).toContain("boundsFromBrush");
    expect(hist).toContain("data-hist-handle");
  });

  it("6. layout uses cqh, not vh, for the limits table / histogram", () => {
    const css = read(src("styles/predict-filter.css"));
    expect(css).toContain("container-name: studio-filter");
    expect(css).toContain("52cqh");
    expect(css).toContain("28cqh");
    expect(css).not.toMatch(/max-height:\s*[^;]*vh/);
    expect(css).toContain("--m16-table-head: #212224");
    expect(css).toContain("--m16-table-well: #131415");
    expect(css).toContain("var(--mat-row-selected");
    const studioRule = css.match(/\.predict-filter-studio\s*\{[^}]+\}/)?.[0];
    expect(studioRule).toBeTruthy();
    expect(studioRule).toContain("border: none");
    expect(studioRule).toContain("background: transparent");
    expect(studioRule).toContain("box-shadow: none");
    // QA-L2: footer pinned outside scroll host (Params pattern).
    expect(css).toContain(".predict-filter-m05-shell");
    const studio = read(src("components/PredictFilterStudio.tsx"));
    expect(studio).toContain("predict-filter-m05-shell");
    const footIdx = studio.indexOf("predict-filter-m05-foot");
    const closeScroll = studio.lastIndexOf("</div>", footIdx);
    expect(footIdx).toBeGreaterThan(0);
    expect(closeScroll).toBeGreaterThan(0);
    expect(closeScroll).toBeLessThan(footIdx);

    const lab = read(src("styles/analysis-lab.css"));
    expect(lab).not.toMatch(
      /\.predict-filter-studio\s*\{[^}]*border:\s*1px solid var\(--bezel\)/,
    );
  });

  it("7. RU/EN studio strings exist and locales parse", () => {
    const ru = JSON.parse(read(locale("ru"))) as {
      predict: { filterStudio: Record<string, string> };
    };
    const en = JSON.parse(read(locale("en"))) as {
      predict: { filterStudio: Record<string, string> };
    };
    for (const key of [
      "limitsTitle",
      "colKeep",
      "colDrop",
      "defaultWarn",
      "apply",
      "originalUntouched",
      "publication",
      "cliTimes",
      "saved",
    ]) {
      expect(ru.predict.filterStudio[key]?.length).toBeGreaterThan(0);
      expect(en.predict.filterStudio[key]?.length).toBeGreaterThan(0);
    }
    expect(ru.predict.filterStudio.apply).toBe("Применить фильтр");
    expect(en.predict.filterStudio.apply).toBe("Apply filter");
  });

  it("8. mockup m05 exists in the handoff pack", () => {
    const png = resolve(
      root,
      "..",
      "..",
      "docs",
      "cursor-handoff",
      "mockups",
      "m05-predict-filter.png",
    );
    expect(existsSync(png)).toBe(true);
  });

  it("9. filter tab toolbar has the Results button (same chrome as Analysis)", () => {
    const page = read(src("pages/PredictPage.tsx"));
    expect(page).toContain('activeTab === "results" || activeTab === "filter"');
    expect(page).toContain('t("predict.results.toTable")');
    expect(page).toContain("predict-results-page-btn--filled");
    expect(page).toContain('navigate("/results")');
    expect(page).toContain("NavIcon id=\"results\"");
  });

  it("10. filter overwrite asks before rewriting *_filtered.txt", () => {
    const page = read(src("pages/PredictPage.tsx"));
    expect(page).toContain("resolveFilterJobOutputPath(predicted, outputFile)");
    expect(page).toContain("askFileOverwrite");
    // Must not silently force overwrite = true when file exists.
    expect(page).not.toMatch(
      /pathExists\(resolveFilterJobOutputPath\(predicted,\s*outputFile\)\)\)\s*\{\s*overwrite\s*=\s*true/,
    );
  });
});
