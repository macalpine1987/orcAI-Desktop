import { useMemo } from "react";
import {
  canUseCsvPredictBatch,
  csvPredictCliRecordingPath,
  countPredictRunnable,
  predictFileNeedsOverwrite,
  predictRecordingStem,
  predictFilesToRun,
  selectedFileNamesForRun,
} from "../lib/predictBatch";
import { buildPredictCliLine } from "../lib/predictCliLine";
import {
  collisionEntriesFromTableSelection,
  hasSharedOutputChannelCollision,
  hasSharedOutputMultiFileRisk,
} from "../lib/predictQueueStudio";
import {
  predictResultsTabEnabled,
  type PredictQueueUnavailableReason,
} from "../lib/predictQueueUi";
import {
  buildPredictJobParams,
  type PredictSettings,
} from "../workspace/predictSettings";
import type { PredictQueue } from "../workspace/predictQueue";
import type { OrcaiModel } from "../api/models";

type RecordingTableRow = { recording: string; channel: number | null };

type Options = {
  queue: PredictQueue | null;
  queueUnavailable: PredictQueueUnavailableReason | null;
  queueLoading: boolean;
  draftSettings: PredictSettings;
  recordingTableRows: RecordingTableRow[];
  recordingTablePath: string;
  modelId: string;
  models: OrcaiModel[];
  orcaiReady: boolean;
  batchRunning: boolean;
  importingWavs: boolean;
  workspaceProjectName: string | null | undefined;
};

/** CLI preview, collisions, runnable counts, tab enable flags. */
export function usePredictRunDerived({
  queue,
  queueUnavailable,
  queueLoading,
  draftSettings,
  recordingTableRows,
  recordingTablePath,
  modelId,
  models,
  orcaiReady,
  batchRunning,
  importingWavs,
  workspaceProjectName,
}: Options) {
  const selectedFileNames = queue ? selectedFileNamesForRun(queue) : [];
  const runnableCount =
    queue && selectedFileNames.length > 0
      ? countPredictRunnable(queue, selectedFileNames)
      : 0;

  const runnableFiles =
    queue && selectedFileNames.length > 0
      ? predictFilesToRun(queue, selectedFileNames)
      : [];
  const queueReady = Boolean(queue) && !queueUnavailable && !queueLoading;
  const channelCollision =
    queueReady &&
    hasSharedOutputChannelCollision({
      outputPath: draftSettings.outputPath,
      entries: collisionEntriesFromTableSelection(
        selectedFileNames,
        recordingTableRows,
        draftSettings.channel,
      ),
    });
  // Same WAV listed twice with different channels is rare in Desktop queue;
  // also warn when shared -o is a non-default path and selection implies multi-run overwrite risk
  // via duplicate stems in the full audio list with mixed table channels (passed empty map → same channel).
  const sharedOutputMultiFile =
    queueReady &&
    hasSharedOutputMultiFileRisk({
      outputPath: draftSettings.outputPath,
      fileCount: runnableFiles.length,
    });

  const cliPreviewLine = useMemo(() => {
    if (!queueReady || !queue || !orcaiReady) return "";
    const pending = predictFilesToRun(queue, selectedFileNames);
    if (!pending.length) return "";
    const tablePath = recordingTablePath;
    const useCsv = canUseCsvPredictBatch(pending, tablePath);
    const recordingPath =
      useCsv && tablePath
        ? csvPredictCliRecordingPath({
            tablePath,
            projectDir: queue.projectDir,
            pending,
            tableRows: recordingTableRows,
          })
        : pending[0].path;
    const extras = useCsv
      ? { recordingNames: pending.map((f) => predictRecordingStem(f.name)) }
      : undefined;
    // Preview must match run: re-running done/filtered files forces -ow.
    const effectiveOverwrite =
      draftSettings.overwrite ||
      pending.some((f) => predictFileNeedsOverwrite(f));
    const params = buildPredictJobParams(
      { ...draftSettings, overwrite: effectiveOverwrite },
      recordingPath,
      queue.projectDir,
      modelId,
      models,
      draftSettings.modelDir,
      extras,
    );
    return buildPredictCliLine(params);
  }, [
    queueReady,
    queue,
    orcaiReady,
    selectedFileNames,
    recordingTablePath,
    recordingTableRows,
    draftSettings,
    modelId,
    models,
  ]);

  const queueBusy = batchRunning || importingWavs || queueLoading;
  // Keep Analysis closed for the whole batch so partial done files do not open
  // the tab before the job ends.
  const resultsEnabled =
    predictResultsTabEnabled(queue, queueReady) &&
    orcaiReady &&
    !batchRunning;
  const filterTabEnabled =
    queueReady &&
    orcaiReady &&
    Boolean(
      queue?.files.some(
        (f) =>
          f.kind === "wav" &&
          (f.status === "done" ||
            f.status === "filtered" ||
            Boolean(f.labelPath?.trim() || f.filteredPath?.trim())),
      ),
    );

  const projectDisplayName =
    queue?.projectName ?? workspaceProjectName ?? null;

  return {
    selectedFileNames,
    runnableCount,
    runnableFiles,
    queueReady,
    channelCollision,
    sharedOutputMultiFile,
    cliPreviewLine,
    queueBusy,
    resultsEnabled,
    filterTabEnabled,
    projectDisplayName,
  };
}
