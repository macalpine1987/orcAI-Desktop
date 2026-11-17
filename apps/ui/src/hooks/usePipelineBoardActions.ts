import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { cancelJob, createJob, type JobRecord } from "../api/jobs";
import {
  fetchProjectParameters,
  type PipelineActivePlan,
  type PipelineStepState,
  type ProjectPipeline,
} from "../api/projects";
import { joinFsPath } from "../lib/joinFsPath";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import { pickJsonOutputFile } from "../platform/dialog";
import { revealInFileManager, writeTextFileAbsolute } from "../platform/shell";
import { isTauri } from "../platform/tauri";

type TrackJob = (job: JobRecord) => void;

type Args = {
  t: TFunction;
  locale: string;
  projectId: string | null;
  projectDir: string | null;
  engineReady: boolean;
  wizardPlanActive: boolean;
  hpsearchBlockedByPlan: boolean;
  hpsearchParallel: boolean;
  board: ProjectPipeline | null;
  activePlan: PipelineActivePlan | null;
  busyIdRef: MutableRefObject<string | null>;
  setBusyId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setMoreId: Dispatch<SetStateAction<string | null>>;
  setOptimisticPlan: Dispatch<SetStateAction<PipelineActivePlan | null>>;
  trackJobInLab: TrackJob;
  load: (silent?: boolean, fresh?: boolean) => Promise<void>;
  notifySaved: (message: string) => void;
};

/** Step run / cancel / artifact / export actions for the pipeline board. */
export function usePipelineBoardActions(args: Args) {
  const {
    t,
    locale,
    projectId,
    projectDir,
    engineReady,
    wizardPlanActive,
    hpsearchBlockedByPlan,
    hpsearchParallel,
    board,
    activePlan,
    busyIdRef,
    setBusyId,
    setError,
    setMoreId,
    setOptimisticPlan,
    trackJobInLab,
    load,
    notifySaved,
  } = args;

  const beginStepBusy = (id: string) => {
    if (busyIdRef.current) return false;
    busyIdRef.current = id;
    setBusyId(id);
    return true;
  };
  const endStepBusy = () => {
    busyIdRef.current = null;
    setBusyId(null);
  };

  const runStep = async (step: PipelineStepState, overwrite = false) => {
    if (
      !engineReady ||
      !step.can_run ||
      wizardPlanActive ||
      (step.id === "hpsearch" && hpsearchBlockedByPlan) ||
      step.status === "blocked" ||
      step.status === "running" ||
      step.status === "queued"
    ) {
      return;
    }
    if (!beginStepBusy(step.id)) return;
    setError(null);
    setMoreId(null);
    try {
      const body: Record<string, unknown> = { ...step.run_params };
      const dir = projectDir ?? String(body.project_dir ?? "");
      if (dir && !body.project_dir) body.project_dir = dir;
      if (overwrite || step.status === "stale" || step.status === "done") {
        body.overwrite = true;
      }
      // Keep joinFsPath in this page: fallback artifact dir if API omits it.
      if (!body.output_dir && dir && step.id === "create-spectrograms") {
        body.output_dir = joinFsPath(dir, "recording_data");
      }
      if (step.id === "hpsearch") {
        if (hpsearchParallel) body.parallel = true;
        else delete body.parallel;
      }
      const job = await createJob(step.id, body);
      trackJobInLab(job);
      await load(true, true);
    } catch (err) {
      setError(
        formatUserFacingErrorRequired(err, t, {
          locale,
          preferPipeline: true,
        }),
      );
    } finally {
      endStepBusy();
    }
  };

  const cancelStep = async (step: PipelineStepState) => {
    if (!step.job_id) return;
    if (!beginStepBusy(step.id)) return;
    try {
      await cancelJob(step.job_id);
      setOptimisticPlan(null);
      await load(true, true);
    } catch (err) {
      setError(
        formatUserFacingErrorRequired(err, t, {
          locale,
          preferPipeline: true,
        }),
      );
    } finally {
      endStepBusy();
    }
  };

  const cancelWizardPlan = async () => {
    const jobId = activePlan?.job_id;
    if (!jobId) return;
    if (!beginStepBusy("__plan__")) return;
    try {
      await cancelJob(jobId);
      setOptimisticPlan(null);
      await load(true, true);
    } catch (err) {
      setError(
        formatUserFacingErrorRequired(err, t, {
          locale,
          preferPipeline: true,
        }),
      );
    } finally {
      endStepBusy();
    }
  };

  const openArtifact = async (step: PipelineStepState) => {
    const path = step.artifact_path || projectDir;
    if (!path) return;
    await revealInFileManager(path);
  };

  const exportParams = async () => {
    if (!board?.parameter_exists || !projectId) return;
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const target = await pickJsonOutputFile(t("pipeline.exportTitle"), board.parameter_filename);
    if (!target) return;
    try {
      const doc = await fetchProjectParameters(projectId);
      await writeTextFileAbsolute(target, doc.text.endsWith("\n") ? doc.text : `${doc.text}\n`);
      notifySaved(t("projects.studio.params.exported", { path: target }));
    } catch (err) {
      setError(
        formatUserFacingErrorRequired(err, t, {
          locale,
          preferPipeline: true,
        }),
      );
    }
  };

  return {
    beginStepBusy,
    endStepBusy,
    runStep,
    cancelStep,
    cancelWizardPlan,
    openArtifact,
    exportParams,
  };
}
