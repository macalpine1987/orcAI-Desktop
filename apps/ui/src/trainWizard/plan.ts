import { joinFsPath } from "../lib/joinFsPath";
import { hpsFileNameForModel, sanitizeWizardDataPaths } from "./defaults";
import { fromScratchCommands, type PlanCommand } from "./planCommands";
import type { TrainWizardDraft } from "./types";

export type { PlanCommand };

export async function buildJobParams(
  draft: TrainWizardDraft,
  projectDir: string,
  paramPath: string,
  command: string,
): Promise<Record<string, unknown>> {
  const paths = sanitizeWizardDataPaths(
    {
      recordingTableRel: draft.recordingTableRel,
      annotationsRel: draft.annotationsRel,
      equivalencesRel: draft.equivalencesRel,
    },
    projectDir,
  );
  const tableRel = paths.recordingTableRel.replace(/^\.\//, "");
  const table = await joinFsPath(projectDir, tableRel);
  /** orcAI expects spectrogram/ + labels/ under the same per-recording tree. */
  const recordingData = await joinFsPath(projectDir, "recording_data");
  const tvt = await joinFsPath(projectDir, "tvt_data");
  const modelsRoot = await joinFsPath(projectDir, "models");
  /** orcAI train does ``output_dir / parameter["name"]`` — pass the parent only. */
  const modelDir = await joinFsPath(projectDir, "models", draft.model.name);
  const hpsearchDir = await joinFsPath(projectDir, "hpsearch");
  const hpsPath = await joinFsPath(
    projectDir,
    hpsFileNameForModel(draft.model.name),
  );
  const compression =
    draft.compression === "None" || draft.compression === "none"
      ? null
      : draft.compression || "GZIP";
  const selectedCalls = draft.classes.filter((c) => c.selected).map((c) => c.id);
  const identityEquivalences = Object.fromEntries(selectedCalls.map((c) => [c, c]));
  const fromDraft =
    draft.equivalencesMap && Object.keys(draft.equivalencesMap).length
      ? { ...identityEquivalences, ...draft.equivalencesMap }
      : identityEquivalences;
  // Keep only mappings whose canonical class is still selected.
  const equivalencesFallback = Object.fromEntries(
    Object.entries(fromDraft).filter(([, canonical]) =>
      selectedCalls.includes(canonical),
    ),
  );
  const eqRel = paths.equivalencesRel.replace(/^\.\//, "");
  const equivalencesPath = await joinFsPath(projectDir, eqRel);
  const annRel = paths.annotationsRel.replace(/^\.\//, "");
  const annotationsDir = await joinFsPath(projectDir, annRel);
  const base = {
    project_dir: projectDir,
    orcai_parameter: paramPath,
  };
  // Wizard re-runs must refresh artifacts when parameters change (orcAI default skips).
  const overwrite = true;
  switch (command) {
    case "create-spectrograms":
      return {
        ...base,
        recording_table_path: table,
        output_dir: recordingData,
        overwrite,
      };
    case "create-label-arrays":
      return {
        ...base,
        recording_table_path: table,
        output_dir: recordingData,
        // Override CSV base_dir_annotation when the wizard path is set.
        base_dir_annotation: annotationsDir,
        call_equivalences: equivalencesPath,
        call_equivalences_fallback: equivalencesFallback,
        overwrite,
      };
    case "create-snippet-table":
      return {
        ...base,
        recording_table_path: table,
        recording_data_dir: recordingData,
        output_dir: tvt,
      };
    case "create-tvt-snippet-tables":
      return {
        ...base,
        output_dir: tvt,
        // orcAI create_snippet_table always writes all_snippets.csv.gz (gzip).
        snippet_table: await joinFsPath(tvt, "all_snippets.csv.gz"),
        // Must match test -tu: create test_unfiltered.csv.gz before create-tvt-data.
        create_unfiltered_test_snippets: Boolean(draft.testAfterTrain),
        overwrite,
      };
    case "create-tvt-data":
      return { ...base, tvt_dir: tvt, compression_type: compression, overwrite };
    case "hpsearch":
      return {
        ...base,
        data_dir: tvt,
        output_dir: hpsearchDir,
        hps_parameter: hpsPath,
        compression_type: compression,
      };
    case "train":
      return {
        ...base,
        data_dir: tvt,
        output_dir: modelsRoot,
        compression_type: compression,
        // TRN-01: opt-in merge of hpsearch winners into -p (sidecar default off).
        ...(draft.scenario === "from_scratch" && draft.includeHpsearch
          ? { apply_best_hyperparameters: true }
          : {}),
        ...(draft.scenario === "finetune" && draft.finetuneBaseModel
          ? { load_model: draft.finetuneBaseModel }
          : {}),
      };
    case "test":
      return {
        ...base,
        model_dir: modelDir,
        data_dir: tvt,
        compression_type: compression,
        test_unfiltered: draft.testAfterTrain,
      };
    default:
      return base;
  }
}

export function planForDraft(
  draft: TrainWizardDraft,
  opts: { prepOnly: boolean },
): PlanCommand[] {
  if (draft.scenario !== "from_scratch" && draft.scenario !== "finetune") {
    return [];
  }
  if (opts.prepOnly) {
    return fromScratchCommands({ prepOnly: true, includeTest: false });
  }
  // Full plan always includes test; toggle controls -tu/-uts.
  // Opt-in hpsearch only for from-scratch (not finetune).
  return fromScratchCommands({
    prepOnly: false,
    includeTest: true,
    includeHpsearch: draft.scenario === "from_scratch" && draft.includeHpsearch,
  });
}
