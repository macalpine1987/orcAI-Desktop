import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  finetuneClassesWithoutExamples,
  mergeFinetuneClasses,
  suggestFinetuneModelName,
} from "../trainWizard/finetune";
import { planForDraft } from "../trainWizard/plan";
import { emptyDraft } from "../trainWizard/defaults";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

describe("finetune gate", () => {
  it("Models «Дообучить» deep-links to wizard finetune", () => {
    const page = read("pages/ModelsPage.tsx");
    expect(page).toContain("onFinetune");
    expect(page).toContain("scenario=finetune");
    expect(page).toContain("base=");
    const studio = read("components/ModelsStudio.tsx");
    expect(studio).toContain("onFinetune");
    expect(studio).not.toContain("finetuneSoon");
  });

  it("TrainWizard unlocks finetune (not soon) and wires load_model", () => {
    const wiz = read("trainWizard/TrainWizard.tsx");
    expect(wiz).toContain("inheritedLocked");
    expect(wiz).toContain("finetuneNeedBase");
    expect(wiz).toContain("finetuneNeedEngine");
    expect(wiz).toContain("hasRuntimeSidecarBase");
    expect(wiz).toContain("fetchModelDetail");
    expect(wiz).toContain("FinetuneDataStep");
    expect(wiz).toContain("--load_model --load_model_from");
    expect(wiz).toContain("finetuneInheritedTitle");
    expect(wiz).toContain("forceFinetuneLocks");
    expect(wiz).toContain("finetuneInheritedMatches");
    expect(wiz).toContain("finetuneLockMatchesSelection");
    expect(wiz).toContain("draftRef");
    expect(wiz).toContain("finetuneOverwriteBase");
    expect(wiz).toContain("snippets:");
    // «Далее» + Launch must share finetuneReady / finetuneDataStepCanNext.
    expect(wiz).toContain("finetuneDataStepCanNext");
    expect(wiz).toContain("finetuneReady");
    expect(wiz).toContain("finetuneApplyStillSameBase");
    expect(wiz).not.toMatch(
      /finetuneApplyStatus\s*===\s*["']ready["']\s*&&\s*Boolean\(\s*finetuneLock\s*\)/,
    );
    // QA-M1: Launch must not reintroduce status === "ready" as a hard gate.
    expect(wiz).not.toMatch(
      /finetuneApplyStatus\s*!==\s*["']ready["']\s*\|\|\s*!finetuneLock/,
    );
    const helpers = read("trainWizard/finetune.ts");
    expect(helpers).toContain("export function finetuneDataStepCanNext");
    expect(helpers).toContain("export function finetuneApplyStillSameBase");
    const panel = read("trainWizard/FinetuneDataStep.tsx");
    expect(panel).toContain("finetuneClassStatus");
    expect(panel).toContain("tw-ft-inherit");
    const plan = read("trainWizard/plan.ts");
    expect(plan).toContain('draft.scenario === "finetune"');
    expect(plan).toContain("load_model");
  });

  it("helpers: name / class merge / plan", () => {
    expect(suggestFinetuneModelName("orcai-isl-v1")).toBe("orcai-isl-v1-ft");
    const rows = mergeFinetuneClasses(
      ["WHISTLE", "SS"],
      [
        {
          id: "WHISTLE",
          count: 10,
          recordings: 2,
          duration_sec: 1,
          coverage: 0.5,
          selected: false,
        },
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.selected).toBe(true);
    expect(rows[1]?.count).toBe(0);
    expect(finetuneClassesWithoutExamples(rows).map((c) => c.id)).toEqual(["SS"]);

    const draft = emptyDraft("demo");
    draft.scenario = "finetune";
    draft.finetuneBaseModel = "/models/base";
    const plan = planForDraft(draft, { prepOnly: false });
    expect(plan.map((p) => p.id)).toContain("train");
    expect(plan.map((p) => p.id)).toContain("test");
  });
});
