import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  f1BarTone,
  formatModelMba,
  formatModelSizeBytes,
  formatShapeRows,
  formatSpectrogramRows,
  modelOverviewParagraphs,
  modelRowKey,
} from "./modelsStudio";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

describe("models studio gate", () => {
  it("ModelsPage uses ModelsStudio studio layout", () => {
    const page = read("pages/ModelsPage.tsx");
    expect(page).toContain("ModelsStudio");
    expect(page).toContain("fetchModelDetail");
    expect(page).toContain("checkModelCompatibility");
    expect(page).not.toContain('t("models.compatBlocked"');
    const onUse = page.slice(page.indexOf("const onUse"), page.indexOf("const onFinetune"));
    const afterCompat = onUse.slice(onUse.indexOf("checkModelCompatibility"));
    expect(afterCompat).toContain("savePredictSettings");
    expect(afterCompat).toContain('navigate("/predict"');
    expect(afterCompat.slice(0, afterCompat.indexOf("savePredictSettings"))).not.toContain(
      "return;",
    );
    const onTest = page.slice(page.indexOf("const onTest"), page.indexOf("const onOpenFolder"));
    expect(onTest).toContain("if (compatBlocked)");
    expect(onTest).toContain("models.compatBlockedTitle");
    expect(page).toContain("importModelDirectory");
    expect(page).toContain("exportModelDirectory");
    expect(page).toContain("persistActiveProjectPredictModel");
    expect(page).toContain("pathExists");
    expect(page).toContain("resolveOrcaiParameterPath");
    expect(page).not.toContain("workspace.projectName");
    expect(page).toContain("testNeedTvt");
    expect(page).toContain("test_dataset");
    expect(page).toContain('navigate("/jobs")');
    expect(page).toContain("scenario=finetune");
    expect(page).toContain("onFinetune");
    expect(page).toContain('createJob("test"');
    const testJob = page.slice(
      page.indexOf('createJob("test"'),
      page.indexOf("trackJobInLab(job)"),
    );
    expect(testJob).toContain("data_dir: tvt");
    expect(testJob).toContain("test_unfiltered: true");
    expect(testJob).not.toMatch(/compression_type/);
  });

  it("AppShell marks /models as page studio", () => {
    const shell = read("layout/AppShell.tsx");
    expect(shell).toContain('location.pathname === "/models"');
    expect(shell).toContain("app-viewport--models-studio");
    expect(shell).toContain("mat-shell-main--models-studio");
  });

  it("API client exposes detail / compatibility / import and parses detail", () => {
    const api = read("api/models.ts");
    expect(api).toContain("fetchModelDetail");
    expect(api).toContain("/v1/models/detail");
    expect(api).toContain("checkModelCompatibility");
    expect(api).toContain("/v1/models/compatibility");
    expect(api).toContain("importModelDirectory");
    expect(api).toContain("/v1/models/export");
    expect(api).toContain("exportModelDirectory");
    expect(api).toContain("throwHttpError");
    expect(api).toContain("json.detail");
    expect(api).toContain("val_mba");
    expect(api).toContain("class_count");
  });

  it("TrainWizard still accepts finetune deep-link props ", () => {
    const wiz = read("trainWizard/TrainWizard.tsx");
    expect(wiz).toContain("initialScenario");
    expect(wiz).toContain("initialBaseModel");
    expect(wiz).toContain("finetuneBaseModel");
    const pipe = read("pages/PipelinePage.tsx");
    expect(pipe).toContain("initialScenario");
    expect(pipe).toContain('params.get("base")');
  });

  it("ModelsStudio table uses Jobs m16 chrome", () => {
    const studio = read("components/ModelsStudio.tsx");
    expect(studio).toContain("jobs-table-body");
    expect(studio).toContain("jobs-table-row-selected");
    expect(studio).toContain("jobs-action-link");
    expect(studio).toContain('t("models.select")');
    expect(studio).toContain("onFinetune");
    expect(studio).not.toContain("formatSpectrogramRows");
    expect(studio).not.toContain("spectrogramParams");
    expect(studio).not.toContain("formatShapeRows");
    expect(studio).not.toContain("inputShape");
    expect(studio).toContain("models-class-f1");
    expect(studio).toContain("formatModelMba(f1)");
    expect(studio).not.toContain("models-class-metrics");
    expect(studio).not.toContain("totalShort");
    expect(studio).toContain("openFolderBuiltinHint");
    expect(studio).toContain("predict-tabs-m03");
    expect(studio).toContain("predict-tab");
    expect(studio).not.toContain("pp-btn pp-btn-preset");
    expect(studio).toContain("ps-btn ps-btn-primary");
    expect(studio).toContain("models-card-actions");
    const useBtn = studio.slice(
      studio.indexOf("models-card-use"),
      studio.indexOf("models.finetune"),
    );
    expect(useBtn).toContain("disabled={busy}");
    expect(useBtn).not.toContain("compatBlocked");
    expect(studio).toMatch(
      /models-card-actions[\s\S]*?ps-btn ps-btn-primary[\s\S]*?className="ps-btn"/,
    );
    expect(studio).not.toContain("mat-btn");
    expect(studio).not.toContain("models-select-btn");
    const css = read("styles/models-studio.css");
    expect(css).toContain("--m16-table-rim-outer");
    expect(css).toContain("models-table-body");
    expect(css).toContain("--models-table-visible-rows: 5");
    expect(css).toContain(".models-card");
    expect(css).toMatch(/\.models-card\s*\{[^}]*background:\s*#191a1b/s);
    expect(css).toMatch(/\.models-desc-panel\s*\{[^}]*background:\s*#191a1b/s);
    expect(css).toMatch(/\.models-card\s*\{[^}]*border:\s*1px solid\s*#2a2c2f/s);
    expect(css).toContain(".models-meta-list");
    expect(css).not.toContain("models-select-btn");
  });

  it("ModelsStudio header matches m15 toolbar layout", () => {
    const studio = read("components/ModelsStudio.tsx");
    expect(studio).toContain("models-page-toolbar");
    expect(studio).toContain('t("models.import")');
    expect(studio).toContain('t("models.export")');
    expect(studio.indexOf('t("models.import")')).toBeLessThan(
      studio.indexOf('t("models.export")'),
    );
    expect(studio).toContain("IconFolder");
    expect(studio).toContain("IconExport");
    expect(studio).not.toContain("IconTrain");
    expect(studio).toContain("builtinKeepNote");
    expect(studio).toContain("exportBuiltinBlocked");
    const helpIdx = studio.indexOf("<PageHelpButton");
    const toolbarIdx = studio.indexOf("models-page-toolbar");
    expect(helpIdx).toBeGreaterThan(-1);
    expect(toolbarIdx).toBeGreaterThan(helpIdx);
  });

  it("CSS + i18n wired", () => {
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    expect(css).toContain("models-studio.css");
    const ru = JSON.parse(
      readFileSync(join(root, "public/locales/ru/ru.json"), "utf8"),
    ) as {
      models: {
        finetune: string;
        compatWarn: string;
        compatCheckNote: string;
        builtinDesc: Record<string, string>;
      };
    };
    const en = JSON.parse(
      readFileSync(join(root, "public/locales/en/en.json"), "utf8"),
    ) as { models: { finetune: string; builtinDesc: Record<string, string> } };
    expect(ru.models.finetune).toBeTruthy();
    expect(ru.models.finetuneNeedSelect).toBeTruthy();
    expect((ru.models as { finetuneSoon?: string }).finetuneSoon).toBeUndefined();
    expect(ru.models.compatWarn).toBeTruthy();
    expect(ru.models.compatCheckNote).toBeTruthy();
    expect(ru.models.compatWarn.toLowerCase()).toContain("orcai_parameter.json");
    const ruModels = ru.models as {
      compatBlocked: string;
      compatBlockedTitle: string;
      compatCheckNote: string;
    };
    const enModels = en.models as {
      compatBlocked: string;
      compatBlockedTitle: string;
      compatCheckNote: string;
    };
    expect(ruModels.compatBlocked).toContain("распознавания");
    expect(ruModels.compatBlocked).toContain("Тест");
    expect(ruModels.compatBlocked).not.toContain("Назначение заблокировано");
    expect(ruModels.compatBlockedTitle.toLowerCase()).toContain("тест");
    expect(ruModels.compatCheckNote).toContain("Тест");
    expect(enModels.compatBlocked).toContain("Recognition");
    expect(enModels.compatBlocked).toContain("Test");
    expect(enModels.compatBlocked).not.toContain("Assignment blocked");
    expect(enModels.compatBlockedTitle).toContain("Test");
    expect(enModels.compatCheckNote).toContain("Test only");
    expect(ru.models.builtinDesc["orcai-nor-v1"].toLowerCase()).toContain("orcai-isl-v1");
    expect(ru.models.builtinDesc["orcai-nor-v1"]).toMatch(/30\s*эпох/i);
    expect(en.models.builtinDesc["orcai-nor-v1"].toLowerCase()).toContain("orcai-isl-v1");
    expect(en.models.builtinDesc["orcai-nor-v1"]).toMatch(/30\s*epochs/i);
    expect((ru.models as { trainedProjectDesc: string }).trainedProjectDesc).toBe(
      "обучена в этом проекте ({{count}} классов).",
    );
    expect((en.models as { trainedProjectDesc: string }).trainedProjectDesc).toBe(
      "trained in this project ({{count}} classes).",
    );
  });

  it("helpers format MBA / size / F1 tone / spectro / shape", () => {
    expect(formatModelMba(0.8421)).toBe("0.842");
    expect(formatModelMba(null)).toBe("—");
    expect(formatModelSizeBytes(10 * 1024 * 1024, "en")).toMatch(/MB/);
    expect(f1BarTone(0.91)).toBe("ok");
    expect(f1BarTone(0.58)).toBe("mid");
    expect(f1BarTone(0.34)).toBe("low");
    expect(modelRowKey({ id: "a", path: "/x" })).toBe("a");
    const spectro = formatSpectrogramRows({
      sampling_rate: 48000,
      nfft: 512,
      freq_range: [0, 16000],
    });
    expect(spectro.some((r) => r.key === "sampling_rate" && r.value === "48000")).toBe(
      true,
    );
    expect(spectro.some((r) => r.key === "freq_range" && r.value.includes("16000"))).toBe(
      true,
    );
    const shape = formatShapeRows({ input_shape: [736, 171, 1], num_labels: 7 });
    expect(shape[0]?.value).toContain("736");
    expect(shape.some((r) => r.key === "num_labels" && r.value === "7")).toBe(true);
  });

  it("Описание shows only the selected model", () => {
    const t = (key: string, opts?: Record<string, unknown>) => {
      if (key === "models.builtinDesc.orcai-isl-v1") return "isl body";
      if (key === "models.builtinDesc.orcai-nor-v1") return "nor body about orcai-isl-v1";
      if (key === "models.trainedProjectDesc") {
        return `trained (${opts?.count} classes)`;
      }
      return String(opts?.defaultValue ?? key);
    };
    const trained = {
      id: "orcai-isl-2026",
      name: "orcai-isl-2026",
      path: "/p/m",
      kind: "trained",
      class_count: 6,
    };
    const builtin = {
      id: "orcai-nor-v1",
      name: "orcai-nor-v1",
      path: "/b/nor",
      kind: "builtin",
    };
    expect(modelOverviewParagraphs(null, null, t)).toEqual([]);
    const trainedParas = modelOverviewParagraphs(trained, null, t);
    expect(trainedParas).toHaveLength(1);
    expect(trainedParas[0]).toContain("orcai-isl-2026 —");
    expect(trainedParas[0]).toContain("6");
    expect(trainedParas[0].toLowerCase()).not.toContain("threshold");
    const builtinParas = modelOverviewParagraphs(builtin, null, t);
    expect(builtinParas).toEqual(["orcai-nor-v1 — nor body about orcai-isl-v1"]);
  });
});
