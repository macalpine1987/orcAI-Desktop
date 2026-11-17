/** Predict queue build — split modules; public API stable via predictQueue barrel. */
export {
  recordingToQueueFile,
  buildPredictQueue,
  mergeFileIntoQueue,
  syncQueueWithProjectRecordings,
  appendImportedToQueue,
  appendRecordingsToQueue,
  activateQueueByWavPath,
  refreshQueueFromRecordings,
} from "./predictQueueBuildCore";

export {
  buildPredictQueueFromTable,
  resolveFilterPredictedPath,
} from "./predictQueueBuildCsv";

export type { PredictNavState } from "./predictQueueBuildPersist";
export {
  queueFromNavigation,
  adoptPendingPredictQueue,
  loadPredictQueue,
  persistPredictQueue,
  patchPredictQueue,
  patchPredictQueueFile,
  setActivePredictFile,
  activePredictFile,
  runningPredictFile,
} from "./predictQueueBuildPersist";
