import { describe, expect, it } from "vitest";
import {
  draftToParameterJson,
  emptyDraft,
  estimateTrain,
  FACTORY_MODEL,
  splitSumOk,
} from "../trainWizard/defaults";
import { planForDraft } from "../trainWizard/plan";
import { formatPlanEta, fromScratchCommands } from "../trainWizard/planCommands";

describe("QA · plan / JSON / ETA", () => {
  it("prepOnly is 5 cmds without train/test; full is 7 with test", () => {
    const d = emptyDraft("X");
    d.testAfterTrain = false;
    const full = planForDraft(d, { prepOnly: false }).map((c) => c.id);
    const prep = planForDraft(d, { prepOnly: true }).map((c) => c.id);
    expect(full).toEqual([
      "create-spectrograms",
      "create-label-arrays",
      "create-snippet-table",
      "create-tvt-snippet-tables",
      "create-tvt-data",
      "train",
      "test",
    ]);
    expect(prep).toEqual(full.slice(0, 5));
    expect(prep).not.toContain("train");
    expect(prep).not.toContain("test");
    expect(full).toContain("test");
  });

  it("includeHpsearch adds hpsearch before train; prepOnly never does", () => {
    const d = emptyDraft("X");
    d.includeHpsearch = true;
    const full = planForDraft(d, { prepOnly: false }).map((c) => c.id);
    expect(full).toEqual([
      "create-spectrograms",
      "create-label-arrays",
      "create-snippet-table",
      "create-tvt-snippet-tables",
      "create-tvt-data",
      "hpsearch",
      "train",
      "test",
    ]);
    expect(planForDraft(d, { prepOnly: true }).map((c) => c.id)).not.toContain(
      "hpsearch",
    );
  });

  it("parameter JSON stays within orcAI shape; selected calls only", () => {
    const d = emptyDraft("Isafjordur-2026");
    d.classes = [
      {
        id: "HERDING",
        count: 96,
        recordings: 4,
        duration_sec: 1,
        coverage: 0.1,
        selected: true,
      },
      {
        id: "BR",
        count: 200,
        recordings: 6,
        duration_sec: 1,
        coverage: 0.2,
        selected: false,
      },
    ];
    const j = draftToParameterJson(d) as Record<string, unknown>;
    expect(String(j.name)).toMatch(/^orcai-/);
    expect(j.calls).toEqual(["HERDING"]);
    const model = j.model as Record<string, unknown>;
    expect(model.call_weights).toBeNull();
    expect(Number.isSafeInteger(j.seed)).toBe(true);
    const sn = j.snippets as { train: number; val: number; test: number };
    expect(sn.train + sn.val + sn.test).toBeCloseTo(1);
    const sp = j.spectrogram as { freq_range: number[] };
    expect(sp.freq_range).toEqual([0, 16000]);
    expect(FACTORY_MODEL.kernel_size).toBe(5);
    expect(FACTORY_MODEL.dropout_rate).toBe(0.3);
    expect(splitSumOk(d.spectro)).toBe(true);
  });

  it("normalizes huge init seed floats to safe integers", async () => {
    const { normalizeOrcaiSeed } = await import("../trainWizard/defaults");
    expect(normalizeOrcaiSeed(5.822715320301442e37)).toBeGreaterThan(0);
    expect(Number.isSafeInteger(normalizeOrcaiSeed(5.822715320301442e37))).toBe(true);
    expect(normalizeOrcaiSeed(42)).toBe(42);
  });

  it("create-snippet-table job params include recording_table_path", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    const params = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-snippet-table",
    );
    expect(params.recording_table_path).toBeTruthy();
    expect(String(params.recording_table_path)).toContain("recording_table");
    expect(String(params.recording_data_dir)).toContain("recording_data");
  });

  it("create-tvt-snippet-tables points at all_snippets.csv.gz", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    const params = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-tvt-snippet-tables",
    );
    expect(String(params.snippet_table)).toMatch(/all_snippets\.csv\.gz$/);
    expect(String(params.output_dir)).toContain("tvt_data");
    expect(params.overwrite).toBe(true);
    expect(params.create_unfiltered_test_snippets).toBe(false);
  });

  it("testAfterTrain enables -uts on TVT tables and -tu on test", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    d.testAfterTrain = true;
    const tvt = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-tvt-snippet-tables",
    );
    const test = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "test",
    );
    expect(tvt.create_unfiltered_test_snippets).toBe(true);
    expect(test.test_unfiltered).toBe(true);
  });

  it("train output_dir is models/; test model_dir is models/<name>", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    d.model.name = "fjord";
    const train = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "train",
    );
    const test = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "test",
    );
    expect(String(train.output_dir).replace(/\\/g, "/")).toMatch(/\/models$/);
    expect(String(test.model_dir).replace(/\\/g, "/")).toMatch(/\/models\/fjord$/);
  });

  it("label arrays get base_dir_annotation from wizard annotationsRel", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    d.annotationsRel = "annotations/";
    const lab = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-label-arrays",
    );
    expect(String(lab.base_dir_annotation)).toMatch(/annotations/);
    expect(lab.overwrite).toBe(true);
  });

  it("spectrograms and labels share recording_data; label step gets equivalences", async () => {
    const { buildJobParams } = await import("../trainWizard/plan");
    const d = emptyDraft("X");
    d.classes = [
      {
        id: "SS",
        count: 1,
        recordings: 1,
        duration_sec: 1,
        coverage: 1,
        selected: true,
      },
    ];
    const spec = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-spectrograms",
    );
    const lab = await buildJobParams(
      d,
      "/tmp/proj",
      "/tmp/proj/x_orcai_parameter.json",
      "create-label-arrays",
    );
    expect(spec.output_dir).toEqual(lab.output_dir);
    expect(String(spec.output_dir)).toContain("recording_data");
    expect(lab.call_equivalences_fallback).toEqual({ SS: "SS" });
  });

  it("formatPlanEta matches m12 wording", () => {
    expect(formatPlanEta(18, { min: "м", hour: "ч" })).toBe("≈ 18 м");
    expect(formatPlanEta(250, { min: "м", hour: "ч" })).toBe("≈ 4 ч 10 м");
  });

  it("estimateTrain baseline ≈ 4h10m at factory epochs×batches", () => {
    const e = estimateTrain(FACTORY_MODEL);
    expect(e.hours).toBe(4);
    expect(e.minutes).toBe(10);
  });

  it("fromScratchCommands can omit test when includeTest=false", () => {
    const ids = fromScratchCommands({
      prepOnly: false,
      includeTest: false,
    }).map((c) => c.id);
    expect(ids).not.toContain("test");
    expect(ids).toContain("train");
  });
});
