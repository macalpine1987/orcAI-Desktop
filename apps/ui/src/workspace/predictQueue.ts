/** Predict queue domain — split modules; public API stable via this barrel. */
export type {
  PredictQueueFileStatus,
  PredictQueueFileKind,
  PredictQueueFile,
  PredictQueue,
} from "./predictQueueTypes";
export {
  isPredictQueueAudioFile,
  namesMatchExact,
  recordingNameMatchesSelection,
  predictQueueAudioFiles,
  isFilteredLabelPath,
  isPredictOutputPresent,
  isDefaultPredictBatchCandidate,
} from "./predictQueueTypes";

export type { PredictStatusHint } from "./predictQueueSelection";
export type { PredictNavState } from "./predictQueueBuild";
export {
  defaultPredictBatchSelection,
  dropCompletedFromPredictSelection,
  finalizePredictSelectionAfterRun,
  ensurePredictSelectionForOverwrite,
  preserveExplicitPredictSelection,
  applyPredictHintsToQueue,
  batchSelectedNames,
  sanitizePredictQueue,
  setQueueSelection,
  selectAllPredictBatch,
  selectDefaultPredictBatch,
  isFileSelectedForPredict,
} from "./predictQueueSelection";

export {
  recordingToQueueFile,
  buildPredictQueue,
  buildPredictQueueFromTable,
  mergeFileIntoQueue,
  queueFromNavigation,
  syncQueueWithProjectRecordings,
  appendImportedToQueue,
  appendRecordingsToQueue,
  activateQueueByWavPath,
  refreshQueueFromRecordings,
  resolveFilterPredictedPath,
  adoptPendingPredictQueue,
  loadPredictQueue,
  persistPredictQueue,
  patchPredictQueue,
  patchPredictQueueFile,
  setActivePredictFile,
  activePredictFile,
  runningPredictFile,
} from "./predictQueueBuild";
