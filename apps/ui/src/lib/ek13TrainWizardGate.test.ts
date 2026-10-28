import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FROM_SCRATCH_COMMANDS,
  PREP_ONLY_COMMANDS,
  WIZARD_STEP_IDS,
} from "../trainWizard/types";
import {
  draftToHpsParameterJson,
  draftToParameterJson,
  emptyDraft,
  FACTORY_HPS,
  FACTORY_MODEL,
  splitSumOk,
} from "../trainWizard/defaults";
import { fromScratchCommands } from "../trainWizard/planCommands";
import { planForDraft } from "../trainWizard/plan";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(uiSrc, rel), "utf8");
}

describe("training wizard gate", () => {
  it("1. Five wizard steps and from-scratch plan without hpsearch", () => {
    expect([...WIZARD_STEP_IDS]).toEqual([
      "scenario",
      "data",
      "spectro",
      "model",
      "preflight",
    ]);
    expect([...FROM_SCRATCH_COMMANDS]).not.toContain("hpsearch");
    expect([...FROM_SCRATCH_COMMANDS]).toEqual([
      "create-spectrograms",
      "create-label-arrays",
      "create-snippet-table",
      "create-tvt-snippet-tables",
      "create-tvt-data",
      "train",
      "test",
    ]);
    expect([...PREP_ONLY_COMMANDS]).toEqual(FROM_SCRATCH_COMMANDS.slice(0, 5));
    const planSrc = read("trainWizard/planCommands.ts");
    expect(planSrc).toContain("export function fromScratchCommands");
    expect(planSrc).toContain('id !== "test"');
    expect(planSrc).toContain("includeHpsearch");
  });

  it("1b. Opt-in hpsearch inserts between create-tvt-data and train", () => {
    const off = fromScratchCommands({
      prepOnly: false,
      includeTest: true,
      includeHpsearch: false,
    }).map((c) => c.id);
    expect(off).not.toContain("hpsearch");
    expect(off.indexOf("create-tvt-data")).toBeLessThan(off.indexOf("train"));

    const on = fromScratchCommands({
      prepOnly: false,
      includeTest: true,
      includeHpsearch: true,
    }).map((c) => c.id);
    expect(on).toContain("hpsearch");
    expect(on.indexOf("create-tvt-data")).toBeLessThan(on.indexOf("hpsearch"));
    expect(on.indexOf("hpsearch")).toBeLessThan(on.indexOf("train"));

    const prep = fromScratchCommands({
      prepOnly: true,
      includeTest: false,
      includeHpsearch: true,
    }).map((c) => c.id);
    expect(prep).not.toContain("hpsearch");
    expect(prep).not.toContain("train");

    const draft = emptyDraft("Demo");
    expect(draft.includeHpsearch).toBe(false);
    expect(planForDraft(draft, { prepOnly: false }).map((c) => c.id)).not.toContain(
      "hpsearch",
    );
    draft.includeHpsearch = true;
    expect(planForDraft(draft, { prepOnly: false }).map((c) => c.id)).toContain(
      "hpsearch",
    );
    expect(planForDraft(draft, { prepOnly: true }).map((c) => c.id)).not.toContain(
      "hpsearch",
    );
  });

  it("1c. HPS JSON matches orcAI default_hps_parameter shape", () => {
    const json = draftToHpsParameterJson(FACTORY_HPS);
    expect(json.filters).toEqual({
      set1: [10, 20, 30, 40],
      set2: [20, 30, 40, 50],
      set3: [30, 40, 50, 60],
    });
    expect(json.lstm_units).toEqual([64, 128]);
    expect(json.dropout_rate).toEqual([0.3, 0.4, 0.5]);
    expect(json.kernel_size).toEqual([3, 5, 7]);
    expect(json.batch_size).toEqual([64]);
    expect(json.tuner).toEqual({
      max_epochs: 15,
      early_stopping_patience: 10,
    });
  });

  it("2. Parameter JSON stays within orcAI keys; publication preset differs from factory", () => {
    const draft = emptyDraft("Demo");
    draft.classes = [
      {
        id: "BR",
        count: 1,
        recordings: 1,
        duration_sec: 1,
        coverage: 1,
        selected: true,
      },
      {
        id: "WHISTLE",
        count: 2,
        recordings: 1,
        duration_sec: 2,
        coverage: 1,
        selected: true,
      },
    ];
    const json = draftToParameterJson(draft);
    expect(json.architecture).toBe("ResNetLSTM");
    expect(Array.isArray(json.calls)).toBe(true);
    expect(FACTORY_MODEL.kernel_size).toBe(5);
    expect(FACTORY_MODEL.dropout_rate).toBe(0.3);
    expect(splitSumOk(draft.spectro)).toBe(true);
  });

  it("3. PipelinePage mounts TrainWizard on view=wizard", () => {
    const page = read("pages/PipelinePage.tsx");
    expect(page).toContain('view === "wizard"');
    expect(page).toContain("TrainWizard");
    expect(page).toContain("active_plan");
    expect(page).toContain("planBusyTitle");
    expect(page).toContain("wizardPlanActive");
    expect(page).not.toContain("pipeline.wizardSoon");
    const wizard = read("trainWizard/TrainWizard.tsx");
    expect(wizard).toContain("saveProjectParameters");
    expect(wizard).toContain("createJob");
    expect(wizard).toContain("plan_id");
    // QA-C1: fail-closed when live pipeline check fails (no catch fall-through).
    expect(wizard).toContain("wizard.planCheckFailed");
    expect(wizard).toMatch(/catch\s*\([^)]*\)\s*\{[^}]*planCheckFailed/s);
    // QA-M3: rollback cancels every created job id, not only [0].
    expect(wizard).toContain("for (const id of createdJobIds)");
    // Load must not clobber synonym edits (generation + pickEquivalencesAfterLoad).
    expect(wizard).toContain("pickEquivalencesAfterLoad");
    expect(wizard).toContain("equivalencesGenRef");
    expect(wizard).toContain("wizard.prepOnly");
    expect(wizard).toContain("wizard.startTrain");
    expect(wizard).not.toContain("PUBLICATION_PRESET");
    expect(wizard).not.toContain("wizard.publicationPreset");
    expect(wizard).toContain("FACTORY_MODEL");
    expect(wizard).toContain("wizard.resetDefaults");
    expect(wizard).toContain("tw-form-head-actions");
    // Step 4 snippet calculator next to «batches per epoch».
    expect(wizard).toContain("TrainWizardSnippetCalcModal");
    expect(wizard).toContain("wizard.calcOpen");
    const calc = read("trainWizard/TrainWizardSnippetCalcModal.tsx");
    expect(calc).toContain("calculateProjectSnippets");
    expect(calc).toContain("snippetCalcCanApply");
    expect(calc).toContain("requestSeq");
    for (const lang of ["ru", "en"]) {
      const loc = JSON.parse(read(`../public/locales/${lang}/${lang}.json`)) as {
        wizard: Record<string, unknown>;
      };
      for (const key of ["calcOpen", "calcTitle", "calcApply", "calcNoBatch", "calcSplit"]) {
        expect(loc.wizard[key], `${lang}.${key}`).toBeTruthy();
      }
    }
    expect(wizard).toContain("wizard.openJson");
    expect(wizard).toContain("TrainWizardParamsJsonModal");
    expect(wizard).toContain("paramsJsonOpen");
    expect(wizard).toContain("wizard.willRunDetail");
    expect(wizard).toContain("canLaunch");
    expect(wizard).toContain("checkModelNameDetailTaken");
    expect(wizard).toContain("classColorsEditable");
    expect(wizard).toContain("CLASS_COLOR_PRESETS");
    expect(wizard).toContain("useProjectClassColors");
    expect(wizard).toContain("TrainWizardHpsModal");
    expect(wizard).toContain("includeHpsearch");
    expect(wizard).toContain("draftToHpsParameterJson");
    expect(wizard).not.toContain("refreshWizard");
    // Step 2 footer: create-label-arrays CLI (not calls = […] literal).
    expect(wizard).toContain("orcai create-label-arrays");
    expect(wizard).toContain("-bda");
    expect(wizard).toContain("-ce");
    expect(wizard).not.toContain("formatCallsLiteral");
    const plan = read("trainWizard/plan.ts");
    expect(plan).toContain("hps_parameter");
    expect(plan).toContain('case "hpsearch"');
  });

  it("4. Locales include wizard.* RU/EN", () => {
    const ru = JSON.parse(read("../public/locales/ru/ru.json"));
    const en = JSON.parse(read("../public/locales/en/en.json"));
    expect(ru.wizard.title).toContain("Мастер");
    expect(en.wizard.title).toMatch(/wizard/i);
    expect(ru.wizard.scenarios.from_scratch.title).toBeTruthy();
    expect(en.wizard.scenarios.finetune.limit).toBeTruthy();
    expect(ru.wizard.colorReset).toBeTruthy();
    expect(en.wizard.colorPickHint).toBeTruthy();
    expect(ru.wizard.step5Title).toMatch(/Проверка/);
    expect(ru.wizard.launchPlanCaption).toBeTruthy();
    expect(en.wizard.testAfterHint).toMatch(/-tu/);
    expect(ru.wizard.includeHpsearch).toBeTruthy();
    expect(en.wizard.hpsModalTitle).toBeTruthy();
    expect(ru.wizard.hpsResetDefaults).toMatch(/default/);
    expect(ru.wizard.hpsearchViaPipeline).toBeTruthy();
    expect(en.wizard.hpsearchOpenPipeline).toBeTruthy();
    expect(ru.wizard.scenarios.hpsearch).toBeUndefined();
    expect(en.wizard.scenarioSoon).toBeUndefined();
    expect(ru.pipeline.planBusyTitle).toMatch(/мастер/i);
    expect(en.pipeline.planBusyTitle).toMatch(/wizard/i);
    expect(ru.wizard.planCheckFailed).toBeTruthy();
    expect(en.wizard.planCheckFailed).toBeTruthy();
    expect(ru.wizard.paramsJsonTitle).toBeTruthy();
    expect(en.wizard.paramsJsonReveal).toBeTruthy();
    expect(ru.pipeline.planCancel).toBeTruthy();
    expect(en.pipeline.planWaiting).toBeTruthy();
    expect(ru.wizard.draftSaved).toMatch(/orcai_parameter/);
    expect(en.wizard.draftSaved).toMatch(/orcai_parameter/);
    expect(ru.wizard.synonymsSaved).toMatch(/call_equivalences/);
    expect(en.wizard.synonymsSaved).toMatch(/call_equivalences/);
    expect(ru.wizard.launched).toMatch(/\{\{count\}\}/);
    expect(en.wizard.launched).toMatch(/\{\{count\}\}/);
  });

  it("5. parameter, synonym, and launch writes announce in the header", () => {
    const wizard = read("trainWizard/TrainWizard.tsx");
    const saved = wizard.match(/notifySaved\(t\("wizard\.draftSaved"\)\)/g);
    // Draft button, JSON save, and JSON reveal write the same parameter file.
    expect(saved).toHaveLength(3);
    expect(wizard).toContain('notifySaved(t("wizard.launched"');
    expect(wizard).toContain('notifySaved(t("wizard.synonymsSaved"))');
    expect(wizard).toContain("useSaveNotice");
  });
});
