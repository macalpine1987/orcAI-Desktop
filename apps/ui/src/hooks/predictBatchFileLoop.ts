import type { MutableRefObject } from "react";
import type { TFunction } from "i18next";
import { createPredictJob, type JobRecord } from "../api/jobs";
import type { OrcaiModel } from "../api/models";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  parsePredictFileLogLine,
  predictBatchProgressUnits,
  predictFileNeedsOverwrite,
} from "../lib/predictBatch";
import {
  expectedPredictOutputPath,
  isAnnotationExistsError,
  parseAnnotationExistsPath,
} from "../lib/predictOverwrite";
import { waitForJobTerminal } from "../lib/waitForJob";
import { saveWorkspace } from "../workspace/storage";
import {
  buildPredictJobParams,
  type PredictSettings,
} from "../workspace/predictSettings";
import {
  patchPredictQueueFile,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";
import { notifyAnalysisRunComplete } from "../lib/analysisRunSummary";
import { resolveFileOverwriteFlag } from "./predictBatchOverwrite";

export type PredictFileBatchLoopArgs = {
  pending: PredictQueueFile[];
  queue: PredictQueue;
  draftSettings: PredictSettings;
  models: OrcaiModel[];
  modelLabel: string | undefined;
  channel: number;
  t: TFunction;
  batchCancelRef: MutableRefObject<boolean>;
  currentBatchJobIdRef: MutableRefObject<string | null>;
  predictMountedRef: MutableRefObject<boolean>;
  askFileOverwrite: (fileName: string, labelPath: string) => Promise<boolean>;
  trackJobInLab: (job: JobRecord) => void;
  updateBatchProgress: (done: number, total: number) => void;
  publishQueue: (next: PredictQueue | null) => void;
  publishQueueAfterBatch: (next: PredictQueue | null) => void;
  endBatch: () => void;
  notifySaved: (message?: string) => void;
  notifyHeaderError: (message: string) => void;
  setAnalysisTabHint: (hint: boolean) => void;
  batchRunningRef: MutableRefObject<boolean>;
};

/** Per-file predict loop (non-CSV batch path). */
export async function runPredictFileBatchLoop(
  args: PredictFileBatchLoopArgs,
): Promise<void> {
  const {
    pending,
    queue,
    draftSettings,
    models,
    modelLabel,
    channel,
    t,
    batchCancelRef,
    currentBatchJobIdRef,
    predictMountedRef,
    askFileOverwrite,
    trackJobInLab,
    updateBatchProgress,
    publishQueue,
    publishQueueAfterBatch,
    endBatch,
    notifySaved,
    notifyHeaderError,
    setAnalysisTabHint,
    batchRunningRef,
  } = args;

  let done = 0;
  let succeeded = 0;
  let failed = 0;
  const preexisting = 0;
  let currentQueue: PredictQueue | null = queue;

  const runPredictJob = async (
    file: PredictQueueFile,
    q: PredictQueue,
    overwrite: boolean,
  ) => {
    const runSettings = { ...draftSettings, overwrite };
    const job = await createPredictJob(
      buildPredictJobParams(
        runSettings,
        file.path,
        q?.projectDir ?? queue.projectDir,
        runSettings.model,
        models,
        runSettings.modelDir,
      ),
    );
    trackJobInLab(job);
    currentBatchJobIdRef.current = job.id;
    const finished = await waitForJobTerminal(
      job.id,
      () => batchCancelRef.current,
      {
        onUpdate: (live) => {
          const parsed = parsePredictFileLogLine(live.log);
          const units =
            parsed != null
              ? predictBatchProgressUnits(parsed, live.progress)
              : typeof live.progress === "number"
                ? live.progress
                : 0;
          updateBatchProgress(
            Math.min(pending.length, done + units),
            pending.length,
          );
        },
      },
    );
    currentBatchJobIdRef.current = null;
    return finished;
  };

  for (const file of pending) {
    if (batchCancelRef.current) break;

    let next = patchPredictQueueFile(
      file.name,
      { status: "running", error: undefined },
      currentQueue,
    );
    if (next) {
      publishQueue(next);
      currentQueue = next;
    }

    try {
      const ow = await resolveFileOverwriteFlag({
        file,
        settingsOverwrite: draftSettings.overwrite,
        channel,
        model: draftSettings.model,
        modelLabel,
        outputPath: draftSettings.outputPath,
        mounted: predictMountedRef.current,
        askFileOverwrite,
      });
      if (ow.kind === "skip" || ow.kind === "decline") {
        if (ow.kind === "decline") {
          next = patchPredictQueueFile(
            file.name,
            { status: "pending", error: undefined },
            currentQueue,
          );
          if (next) {
            publishQueue(next);
            currentQueue = next;
          }
        }
        done += 1;
        updateBatchProgress(done, pending.length);
        continue;
      }
      const overwriteFlag = ow.overwrite;

      let finished = await runPredictJob(file, currentQueue!, overwriteFlag);

      if (
        finished.status === "failed" &&
        isAnnotationExistsError(finished.error)
      ) {
        const labelPath =
          parseAnnotationExistsPath(finished.error) ??
          expectedPredictOutputPath(
            file.path,
            channel,
            draftSettings.model,
            modelLabel,
            draftSettings.outputPath,
          );
        if (predictMountedRef.current) {
          const confirmed = await askFileOverwrite(file.name, labelPath);
          if (confirmed) {
            finished = await runPredictJob(file, currentQueue!, true);
          }
        }
      }

      if (finished.status === "completed") {
        succeeded += 1;
        const labelPath =
          typeof finished.result?.label_path === "string"
            ? finished.result.label_path
            : undefined;
        const wavPath =
          typeof finished.result?.wav_path === "string"
            ? finished.result.wav_path
            : file.path;
        next = patchPredictQueueFile(
          file.name,
          {
            status: "done",
            labelPath,
            // The filtered file was built from the previous predictions.
            filteredPath: undefined,
            error: undefined,
          },
          currentQueue,
        );
        if (currentQueue?.activeFileName === file.name && labelPath) {
          saveWorkspace({ lastLabelPath: labelPath, lastWavPath: wavPath });
        }
      } else if (finished.status === "cancelled") {
        next = patchPredictQueueFile(
          file.name,
          {
            status: predictFileNeedsOverwrite(file) ? "done" : "pending",
            error: undefined,
          },
          currentQueue,
        );
      } else if (
        finished.status === "failed" &&
        isAnnotationExistsError(finished.error)
      ) {
        next = patchPredictQueueFile(
          file.name,
          { status: "pending", error: undefined },
          currentQueue,
        );
      } else {
        failed += 1;
        next = patchPredictQueueFile(
          file.name,
          {
            status: "failed",
            error: formatUserFacingErrorRequired(
              finished.error ?? t("predict.queueStatusFailed"),
              t,
            ),
          },
          currentQueue,
        );
      }
    } catch (err) {
      failed += 1;
      next = patchPredictQueueFile(
        file.name,
        {
          status: "failed",
          error: formatUserFacingErrorRequired(err, t),
        },
        currentQueue,
      );
    }
    if (next) {
      publishQueue(next);
      currentQueue = next;
    }
    done += 1;
    updateBatchProgress(done, pending.length);
  }

  if (currentQueue) {
    publishQueueAfterBatch(currentQueue);
  }

  endBatch();
  currentBatchJobIdRef.current = null;
  batchRunningRef.current = false;
  if (!predictMountedRef.current) return;
  if (succeeded > 0 || failed > 0 || preexisting > 0) {
    notifyAnalysisRunComplete(
      {
        succeeded,
        failed,
        total: pending.length,
        preexisting,
      },
      { t, notifySaved, notifyHeaderError },
    );
    if (succeeded > 0 || preexisting > 0) {
      setAnalysisTabHint(true);
    }
  }
}
