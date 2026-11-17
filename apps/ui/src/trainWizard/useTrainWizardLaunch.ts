/** TrainWizard launch / save / busy (move-only extract). */
import { type Dispatch, type SetStateAction } from "react";
import { useBusyGuard } from "../hooks/useBusyGuard";
import { cancelJob, createJob } from "../api/jobs";
import { silentCatch } from "../lib/silentCatch";
import {
  fetchProjectParameters,
  fetchProjectPipeline,
  saveProjectParameters,
  type ProjectPipeline,
} from "../api/projects";
import { writeTextFile } from "../api/filterPreview";
import { joinFsPath } from "../lib/joinFsPath";
import { pipelineBlockedWithoutAnnotations } from "../lib/trainPipeline";
import { revealInFileManager } from "../platform/shell";
import {
  draftToHpsParameterJson,
  draftToParameterJson,
  hpsFileNameForModel,
} from "./defaults";
import {
  finetuneDataStepCanNext,
  finetuneInheritedMatches,
  finetuneOutputCollidesWithBase,
  forceFinetuneLocks,
  type FinetuneLockSnapshot,
} from "./finetune";
import { buildJobParams, planForDraft } from "./plan";
import type { TrainWizardDraft } from "./types";
import { wizardErrorMessage, type TrainWizardCloseResult } from "./wizardHelpers";
import type { JobRecord } from "../api/jobs";

type Args = {
  projectId: string | null;
  projectDir: string | null | undefined;
  engineReady: boolean;
  draft: TrainWizardDraft;
  pipeline: ProjectPipeline | null;
  setPipeline: Dispatch<SetStateAction<ProjectPipeline | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  finetuneApplyStatus: "idle" | "loading" | "ready" | "error";
  finetuneLock: FinetuneLockSnapshot | null;
  baseSharesExamples: boolean;
  modelDirTaken: boolean;
  selectedCalls: string[];
  paramsOk: boolean;
  persistEquivalences: (
    map?: import("./equivalences").EquivalencesMap,
    fromDraft?: TrainWizardDraft,
  ) => Promise<void>;
  trackJobInLab: (job: JobRecord) => void;
  notifySaved: (msg: string) => void;
  onClose: (result?: TrainWizardCloseResult) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function useTrainWizardLaunch({
  projectId,
  projectDir,
  engineReady,
  draft,
  pipeline,
  setPipeline,
  setError,
  setNotice,
  finetuneApplyStatus,
  finetuneLock,
  baseSharesExamples,
  modelDirTaken,
  selectedCalls,
  paramsOk,
  persistEquivalences,
  trackJobInLab,
  notifySaved,
  onClose,
  t,
}: Args) {
  const { busy, busyRef, markBusy } = useBusyGuard();

  const finetuneReady = (): boolean =>
    finetuneDataStepCanNext({
      baseModel: draft.finetuneBaseModel,
      engineReady,
      applyStatus: finetuneApplyStatus,
      lock: finetuneLock,
      sharesExamples: baseSharesExamples,
    });

  const diskBlocked = pipeline?.readiness.disk.state === "off";
  const launchBlockedReason = (() => {
    if (!engineReady) return t("wizard.needEngine");
    if (pipeline?.active_plan) return t("wizard.planBusy");
    if (draft.scenario === "finetune") {
      // QA-M1: do not require applyStatus === "ready" — matching lock is enough
      // (same as data-step Next / Strict Mode).
      if (!finetuneReady()) {
        if (!draft.finetuneBaseModel?.trim()) return t("wizard.finetuneNeedBase");
        if (finetuneApplyStatus === "loading") return t("wizard.finetuneApplying");
        return t("wizard.finetuneNeedBaseReady");
      }
      // All-zero new examples: warn in UI, still allow launch (user may proceed).
      if (
        finetuneOutputCollidesWithBase(draft.model.name, draft.finetuneBaseModel)
      ) {
        return t("wizard.finetuneOverwriteBase");
      }
      if (modelDirTaken) return t("wizard.finetuneNameTaken");
    }
    if (!selectedCalls.length) return t("wizard.needClasses");
    if (diskBlocked) return t("wizard.diskBlocked");
    if (!paramsOk) return t("wizard.checkParamsDetailBad");
    if (!draft.model.name.trim()) return t("wizard.needModelName");
    return null;
  })();
  const annotationsBlockTrain = pipelineBlockedWithoutAnnotations(pipeline);
  const canLaunch = !busy && !launchBlockedReason && !annotationsBlockTrain;

  const saveDraftParams = async () => {
    if (!projectId) return;
    markBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, t);
      if (msg) setError(msg);
    } finally {
      markBusy(false);
    }
  };

  const saveParamsJsonToDisk = async () => {
    if (!projectId) return;
    markBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, t);
      if (msg) setError(msg);
      throw err;
    } finally {
      markBusy(false);
    }
  };

  const revealParamsJson = async () => {
    if (!projectId) return;
    markBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      const params = await fetchProjectParameters(projectId);
      if (params.path) {
        await revealInFileManager(params.path);
      }
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, t);
      if (msg) setError(msg);
      throw err;
    } finally {
      markBusy(false);
    }
  };

  const launch = async (prepOnly: boolean) => {
    if (!projectId || !projectDir || !engineReady) {
      setError(t("wizard.needEngine"));
      return;
    }
    // Busy before any await — blocks double Prep Only / Start before re-paint.
    if (busyRef.current) return;
    markBusy(true);
    setError(null);
    const createdJobIds: string[] = [];
    try {
      // Fresh check — board poll may lag behind a just-started plan.
      // Fail-closed: never launch when we cannot confirm the board is free.
      try {
        const live = await fetchProjectPipeline(projectId);
        setPipeline(live);
        if (live.active_plan) {
          setError(t("wizard.planBusy"));
          return;
        }
        if (pipelineBlockedWithoutAnnotations(live)) return;
      } catch (err) {
        const msg = wizardErrorMessage(err, t, t("wizard.planCheckFailed"));
        setError(msg ?? t("wizard.planCheckFailed"));
        return;
      }
      // INV-2: finetune-only guards — from_scratch path unchanged below.
      let launchDraft = draft;
      if (draft.scenario === "finetune") {
        if (!finetuneReady() || !finetuneLock) {
          setError(
            !draft.finetuneBaseModel?.trim()
              ? t("wizard.finetuneNeedBase")
              : !baseSharesExamples
                ? t("wizard.finetuneNoSharedClassesNote")
                : t("wizard.finetuneNeedBaseReady"),
          );
          return;
        }
        launchDraft = {
          ...forceFinetuneLocks(draft, finetuneLock),
          // Jobs need the resolved model directory; keep React selection stable.
          finetuneBaseModel: finetuneLock.path,
        };
        if (
          !finetuneInheritedMatches(
            launchDraft,
            finetuneLock.spectro,
            finetuneLock.model,
          )
        ) {
          setError(t("wizard.finetuneMismatch"));
          return;
        }
        if (
          finetuneOutputCollidesWithBase(
            launchDraft.model.name,
            finetuneLock.path,
          )
        ) {
          setError(t("wizard.finetuneOverwriteBase"));
          return;
        }
        if (modelDirTaken) {
          setError(t("wizard.finetuneNameTaken"));
          return;
        }
        // Do not setDraft(path) here — that retriggered apply and blocked Next.
      }
      if (!launchDraft.classes.some((c) => c.selected)) {
        setError(t("wizard.needClasses"));
        return;
      }
      const disk = pipeline?.readiness.disk;
      if (disk && disk.state === "off") {
        setError(t("wizard.diskBlocked"));
        return;
      }
      await persistEquivalences(undefined, launchDraft);
      const text = `${JSON.stringify(draftToParameterJson(launchDraft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      if (launchDraft.includeHpsearch && !prepOnly) {
        const hpsRel = hpsFileNameForModel(launchDraft.model.name);
        const hpsAbs = await joinFsPath(projectDir, hpsRel);
        const hpsText = `${JSON.stringify(draftToHpsParameterJson(launchDraft.hps), null, 4)}\n`;
        await writeTextFile(hpsAbs, hpsText);
      }
      const paramPath =
        pipeline?.parameter_path ||
        (await joinFsPath(projectDir, pipeline?.parameter_filename || "orcai_parameter.json"));
      const plan = planForDraft(launchDraft, { prepOnly });
      const planId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `plan-${Date.now()}`;
      for (const step of plan) {
        const params = await buildJobParams(launchDraft, projectDir, paramPath, step.id);
        const job = await createJob(step.id, { ...params, plan_id: planId });
        createdJobIds.push(job.id);
        trackJobInLab(job);
      }
      setNotice(t("wizard.launched", { count: plan.length }));
      notifySaved(t("wizard.launched", { count: plan.length }));
      const commands = plan.map((step) => step.id);
      onClose({
        planId,
        firstJobId: createdJobIds[0],
        jobCount: plan.length,
        includesHpsearch: commands.includes("hpsearch"),
        commands,
      });
    } catch (err) {
      // Cancel every created job — cascade from head alone misses running siblings.
      for (const id of createdJobIds) {
        try {
          await cancelJob(id);
        } catch (cancelErr) {
          silentCatch("wizardLaunchRollbackCancel")(cancelErr);
        }
      }
      const msg = wizardErrorMessage(err, t);
      if (msg) setError(msg);
    } finally {
      markBusy(false);
    }
  };



  return {
    busy,
    markBusy,
    busyRef,
    launchBlockedReason,
    annotationsBlockTrain,
    canLaunch,
    saveDraftParams,
    saveParamsJsonToDisk,
    revealParamsJson,
    launch,
  };
}
