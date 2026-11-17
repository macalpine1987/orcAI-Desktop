import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import { notifyAnalysisRunComplete } from "../lib/analysisRunSummary";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cancelJob, createPredictJob } from "../api/jobs";
import {
  canUseCsvPredictBatch,
  parsePredictFileLogLine,
  predictBatchProgressUnits,
  predictFileNeedsOverwrite,
  predictFileQueuePatchesFromLog,
  predictRecordingStem,
  predictFilesToRun,
  selectedFileNamesForRun,
  type PredictBatchFileResult,
} from "../lib/predictBatch";
import { expectedPredictOutputPath } from "../lib/predictOverwrite";
import { channelForQueueFile } from "../lib/predictQueueStudio";
import { resolveModelLabelName } from "../lib/predictQueueUi";
import { waitForJobTerminal } from "../lib/waitForJob";
import { buildPredictJobParams } from "../workspace/predictSettings";
import {
  finalizePredictSelectionAfterRun,
  patchPredictQueueFile,
  persistPredictQueue,
  type PredictQueue,
} from "../workspace/predictQueue";
import type {
  UsePredictBatchRunOptions,
  UsePredictBatchRunResult,
} from "./usePredictBatchRunTypes";
import { applyCsvBatchFileResults } from "./predictBatchCsv";
import { runPredictFileBatchLoop } from "./predictBatchFileLoop";

export function usePredictBatchRun({
  queue,
  setQueue,
  setError,
  draftSettings,
  models,
  orcaiReady,
  predictTableBlocked,
  recordingTablePath,
  recordingTableRows,
  predictMountedRef,
  askFileOverwrite,
  askBatchOverwrite,
  trackJobInLab,
  startBatch,
  updateBatchProgress,
  endBatch,
  notifySaved,
  notifyHeaderError,
  dismissHeaderError,
  setAnalysisTabHint,
}: UsePredictBatchRunOptions): UsePredictBatchRunResult {
  const { t } = useTranslation();
  const batchCancelRef = useRef(false);
  const currentBatchJobIdRef = useRef<string | null>(null);
  const batchRunningRef = useRef(false);

  const runBatchRecognition = async () => {
    if (batchRunningRef.current) return;
    if (!queue || !orcaiReady) return;
    if (predictTableBlocked) {
      setError(t("projects.studio.table.predictBlockedStale"));
      return;
    }

    const fileNames = selectedFileNamesForRun(queue);
    const pending = predictFilesToRun(queue, fileNames);
    if (!pending.length) {
      setError(t("predict.run.nothingToRun"));
      return;
    }

    const rerunCount = pending.filter((f) => predictFileNeedsOverwrite(f)).length;
    if (!draftSettings.overwrite && rerunCount > 0) {
      const confirmed = await askBatchOverwrite(rerunCount, pending.length);
      if (!confirmed) return;
      // Dialog awaited — another click may have started a batch.
      if (batchRunningRef.current) return;
    }

    batchRunningRef.current = true;
    batchCancelRef.current = false;
    currentBatchJobIdRef.current = null;
    dismissHeaderError();
    setAnalysisTabHint(false);
    startBatch(pending.length);
    setError(null);

    const modelLabel = resolveModelLabelName(
      models,
      draftSettings.model,
      draftSettings.modelDir,
    );
    const channel = Math.max(1, Math.floor(draftSettings.channel) || 1);
    const tablePath = recordingTablePath.trim();
    const useCsvBatch = canUseCsvPredictBatch(pending, tablePath);

    let done = 0;
    let succeeded = 0;
    let failed = 0;
    let preexisting = 0;
    let currentQueue: PredictQueue | null = queue;

    const publishQueue = (next: PredictQueue | null) => {
      if (!next) return;
      currentQueue = next;
      persistPredictQueue(next);
      if (predictMountedRef.current) setQueue(next);
    };

    const publishQueueAfterBatch = (next: PredictQueue | null) => {
      if (!next) return;
      publishQueue(
        finalizePredictSelectionAfterRun(next, draftSettings.overwrite),
      );
    };

    const markPendingRunning = () => {
      let next = currentQueue;
      for (const file of pending) {
        next = patchPredictQueueFile(
          file.name,
          { status: "running", error: undefined },
          next,
        );
      }
      if (next) publishQueue(next);
    };

    const applyBatchFileResults = (
      results: PredictBatchFileResult[],
      jobStatus: Parameters<typeof applyCsvBatchFileResults>[0]["jobStatus"],
    ) => {
      const out = applyCsvBatchFileResults({
        pending,
        results,
        jobStatus,
        currentQueue,
        failedLabel: t("predict.queueStatusFailed"),
      });
      succeeded += out.succeeded;
      failed += out.failed;
      preexisting += out.preexisting;
      done = pending.length;
      updateBatchProgress(done, pending.length);
      if (out.next) publishQueueAfterBatch(out.next);
    };

    if (useCsvBatch) {
      markPendingRunning();
      const overwriteFlag =
        draftSettings.overwrite ||
        pending.some((f) => predictFileNeedsOverwrite(f));
      const stems = pending.map((f) => predictRecordingStem(f.name));
      try {
        const job = await createPredictJob(
          buildPredictJobParams(
            { ...draftSettings, overwrite: overwriteFlag },
            tablePath,
            currentQueue?.projectDir ?? queue.projectDir,
            draftSettings.model,
            models,
            draftSettings.modelDir,
            { recordingNames: stems },
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
              if (parsed) {
                updateBatchProgress(
                  predictBatchProgressUnits(parsed, live.progress),
                  pending.length,
                );
                const patches = predictFileQueuePatchesFromLog(
                  pending,
                  parsed,
                  (file) =>
                    expectedPredictOutputPath(
                      file.path,
                      channelForQueueFile(file, recordingTableRows, channel),
                      draftSettings.model,
                      modelLabel,
                      draftSettings.outputPath,
                      { csvBatch: true },
                    ),
                );
                let next: PredictQueue | null = currentQueue;
                for (const patch of patches) {
                  next = patchPredictQueueFile(
                    patch.name,
                    {
                      status: patch.status,
                      ...(patch.labelPath
                        ? { labelPath: patch.labelPath, error: undefined }
                        : { error: undefined }),
                    },
                    next,
                  );
                }
                if (next) publishQueue(next);
              } else if (typeof live.progress === "number" && live.progress >= 0) {
                updateBatchProgress(
                  Math.min(pending.length, live.progress * pending.length),
                  pending.length,
                );
              }
            },
          },
        );
        currentBatchJobIdRef.current = null;

        const rawFiles = finished.result?.files;
        const results: PredictBatchFileResult[] = Array.isArray(rawFiles)
          ? (rawFiles as PredictBatchFileResult[])
          : [];

        if (finished.status === "completed" || results.length > 0) {
          applyBatchFileResults(results, finished.status);
        } else if (finished.status === "cancelled") {
          applyBatchFileResults(results, "cancelled");
        } else {
          failed = pending.length;
          let next: PredictQueue | null = currentQueue;
          for (const file of pending) {
            next = patchPredictQueueFile(
              file.name,
              {
                status: "failed",
                error: formatUserFacingErrorRequired(
                  finished.error ?? t("predict.queueStatusFailed"),
                  t,
                ),
              },
              next,
            );
          }
          if (next) publishQueueAfterBatch(next);
          done = pending.length;
          updateBatchProgress(done, pending.length);
        }
      } catch (err) {
        failed = pending.length;
        let next: PredictQueue | null = currentQueue;
        for (const file of pending) {
          next = patchPredictQueueFile(
            file.name,
            {
              status: "failed",
              error: formatUserFacingErrorRequired(err, t),
            },
            next,
          );
        }
        if (next) publishQueueAfterBatch(next);
        done = pending.length;
        updateBatchProgress(done, pending.length);
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
      return;
    }

    await runPredictFileBatchLoop({
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
    });
  };

  const onBatchCancel = () => {
    batchCancelRef.current = true;
    const jobId = currentBatchJobIdRef.current;
    if (jobId) {
      void cancelJob(jobId).catch((err) => {
        setError(formatUserFacingErrorRequired(err, t));
      });
    }
  };

  return { runBatchRecognition, onBatchCancel };
}
