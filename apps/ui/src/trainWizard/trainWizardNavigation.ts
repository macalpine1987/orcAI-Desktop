/** Pure Next-button gates for TrainWizard (move-only extract). */
import { splitSumOk } from "./defaults";
import {
  finetuneDataStepCanNext,
  finetuneLockMatchesSelection,
  finetuneOutputCollidesWithBase,
  type FinetuneLockSnapshot,
} from "./finetune";
import type { TrainWizardDraft } from "./types";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export type FinetuneApplyStatus = "idle" | "loading" | "ready" | "error";

export function finetuneReadyForNext(args: {
  baseModel: string | null | undefined;
  engineReady: boolean;
  applyStatus: FinetuneApplyStatus;
  lock: FinetuneLockSnapshot | null;
  sharesExamples: boolean;
}): boolean {
  return finetuneDataStepCanNext(args);
}

export function canNext(args: {
  draft: TrainWizardDraft;
  engineReady: boolean;
  finetuneApplyStatus: FinetuneApplyStatus;
  finetuneLock: FinetuneLockSnapshot | null;
  baseSharesExamples: boolean;
  selectedCalls: string[];
  modelDirTaken: boolean;
}): boolean {
  const {
    draft,
    engineReady,
    finetuneApplyStatus,
    finetuneLock,
    baseSharesExamples,
    selectedCalls,
    modelDirTaken,
  } = args;
  if (draft.step === "data") {
    if (draft.scenario === "finetune") {
      // QA-M1: same predicate as Launch (real engineReady + matching lock).
      return finetuneReadyForNext({
        baseModel: draft.finetuneBaseModel,
        engineReady,
        applyStatus: finetuneApplyStatus,
        lock: finetuneLock,
        sharesExamples: baseSharesExamples,
      });
    }
    return selectedCalls.length > 0;
  }
  if (draft.step === "spectro") return splitSumOk(draft.spectro);
  if (draft.step === "model") {
    if (!draft.model.name.trim()) return false;
    if (
      draft.scenario === "finetune" &&
      finetuneOutputCollidesWithBase(
        draft.model.name,
        finetuneLock?.path || draft.finetuneBaseModel,
      )
    ) {
      return false;
    }
    if (draft.scenario === "finetune" && modelDirTaken) return false;
    return true;
  }
  return true;
}

export function nextBlockedReason(args: {
  draft: TrainWizardDraft;
  engineReady: boolean;
  finetuneApplyStatus: FinetuneApplyStatus;
  finetuneLock: FinetuneLockSnapshot | null;
  baseSharesExamples: boolean;
  catalogModelsLength: number;
  selectedCalls: string[];
  modelDirTaken: boolean;
  t: Translate;
}): string | null {
  const {
    draft,
    engineReady,
    finetuneApplyStatus,
    finetuneLock,
    baseSharesExamples,
    catalogModelsLength,
    selectedCalls,
    modelDirTaken,
    t,
  } = args;
  if (
    canNext({
      draft,
      engineReady,
      finetuneApplyStatus,
      finetuneLock,
      baseSharesExamples,
      selectedCalls,
      modelDirTaken,
    })
  ) {
    return null;
  }
  if (draft.step === "data" && draft.scenario === "finetune") {
    if (!engineReady) {
      return t("wizard.finetuneNeedEngine");
    }
    if (!draft.finetuneBaseModel?.trim()) {
      if (!catalogModelsLength) return t("wizard.finetuneNeedCatalog");
      return t("wizard.finetuneNeedBase");
    }
    if (!baseSharesExamples) return t("wizard.finetuneNoSharedClassesNote");
    if (finetuneApplyStatus === "loading") {
      return t("wizard.finetuneApplying");
    }
    if (finetuneApplyStatus === "error") {
      return t("wizard.finetuneNeedBaseReady");
    }
    if (!finetuneLockMatchesSelection(finetuneLock, draft.finetuneBaseModel)) {
      return t("wizard.finetuneNeedBaseReady");
    }
  }
  if (draft.step === "data" && !selectedCalls.length) return t("wizard.needClasses");
  if (draft.step === "model" && !draft.model.name.trim()) {
    return t("wizard.needModelName");
  }
  if (
    draft.step === "model" &&
    draft.scenario === "finetune" &&
    finetuneOutputCollidesWithBase(
      draft.model.name,
      finetuneLock?.path || draft.finetuneBaseModel,
    )
  ) {
    return t("wizard.finetuneOverwriteBase");
  }
  if (draft.step === "model" && draft.scenario === "finetune" && modelDirTaken) {
    return t("wizard.finetuneNameTaken");
  }
  return null;
}
