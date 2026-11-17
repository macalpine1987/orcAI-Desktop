import {
  isDefaultPredictBatchCandidate,
  isPredictQueueAudioFile,
  isPredictOutputPresent,
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
} from "./predictQueueTypes";

export function defaultPredictBatchSelection(
  files: PredictQueueFile[],
): string[] {
  return files.filter(isDefaultPredictBatchCandidate).map((f) => f.name);
}

/** Drop recognized rows from the batch selection (after a run or status hydrate). */
export function dropCompletedFromPredictSelection(
  queue: PredictQueue,
): PredictQueue {
  const files = predictQueueAudioFiles(queue);
  const byName = new Map(files.map((f) => [f.name, f]));
  // Use effective selection so toggling overwrite does not freeze an empty
  // implicit default (selectedNames=[] + explicit) and disable Run.
  const selectedNames = batchSelectedNames(queue).filter((n) => {
    const file = byName.get(n);
    if (!file) return false;
    if (file.status === "failed") return true;
    return !isPredictOutputPresent(file);
  });
  return {
    ...queue,
    selectedNames,
    batchSelectionExplicit: true,
  };
}

/**
 * After a batch: keep done/filtered selected when overwrite (-ow) is on so the
 * user can re-run immediately; otherwise drop completed rows (default).
 */
export function finalizePredictSelectionAfterRun(
  queue: PredictQueue,
  overwrite: boolean,
): PredictQueue {
  if (overwrite) {
    const names = new Set(predictQueueAudioFiles(queue).map((f) => f.name));
    return {
      ...queue,
      selectedNames: queue.selectedNames.filter((n) => names.has(n)),
      batchSelectionExplicit: true,
    };
  }
  return dropCompletedFromPredictSelection(queue);
}

/**
 * Turning overwrite on with an empty selection:
 * pending/failed rows → default batch; only completed rows → select all
 * so «Start recognition» stays usable for a re-run.
 */
export function setQueueSelection(
  queue: PredictQueue,
  selectedNames: Iterable<string>,
): PredictQueue {
  return {
    ...queue,
    selectedNames: [...selectedNames],
    batchSelectionExplicit: true,
  };
}

/** «Select all» — every WAV, including already recognized (for re-run). */
export function selectAllPredictBatch(queue: PredictQueue): PredictQueue {
  return setQueueSelection(
    queue,
    predictQueueAudioFiles(queue).map((f) => f.name),
  );
}

/** Back to default: only unrecognized / failed. */
export function selectDefaultPredictBatch(queue: PredictQueue): PredictQueue {
  return setQueueSelection(
    queue,
    defaultPredictBatchSelection(predictQueueAudioFiles(queue)),
  );
}

export function ensurePredictSelectionForOverwrite(
  queue: PredictQueue,
): PredictQueue {
  const audio = predictQueueAudioFiles(queue);
  if (audio.length === 0) return queue;
  if (batchSelectedNames(queue).length > 0) return queue;
  if (audio.some(isDefaultPredictBatchCandidate)) {
    return selectDefaultPredictBatch(queue);
  }
  return selectAllPredictBatch(queue);
}

/**
 * After an async recording-table refresh, keep the user's latest checkbox
 * selection so a stale fetch cannot clear it and disable Run.
 */
export function preserveExplicitPredictSelection(
  next: PredictQueue,
  latest: PredictQueue | null,
): PredictQueue {
  if (!latest || latest.projectId !== next.projectId) return next;
  if (latest.batchSelectionExplicit !== true) return next;
  const names = new Set(predictQueueAudioFiles(next).map((f) => f.name));
  return {
    ...next,
    selectedNames: latest.selectedNames.filter((n) => names.has(n)),
    batchSelectionExplicit: true,
  };
}

export type PredictStatusHint = {
  recording: string;
  predict_status: "done" | "running" | "failed" | "none";
  predicted_path: string | null;
};

/**
 * Mark queue rows as done when the project recording table already has predictions.
 * Keeps intentional selection (`batchSelectionExplicit`) so already-recognized files
 * can be re-run; otherwise drops completed rows from the batch (soft hydrate).
 */
export function applyPredictHintsToQueue(
  queue: PredictQueue,
  hints: PredictStatusHint[],
): PredictQueue {
  if (!hints.length) return queue;
  const byStem = new Map<string, PredictStatusHint>();
  for (const hint of hints) {
    const stem = hint.recording.trim();
    if (!stem) continue;
    byStem.set(stem, hint);
  }
  const files = queue.files.map((f) => {
    if (!isPredictQueueAudioFile(f)) return f;
    if (f.status === "running" || f.status === "failed") return f;
    if (f.status === "filtered") return f;
    const stem = f.name.replace(/\.wav$/i, "");
    const hint = byStem.get(stem);
    if (!hint || hint.predict_status !== "done") return f;
    return {
      ...f,
      status: "done" as const,
      labelPath: f.labelPath?.trim() || hint.predicted_path || f.labelPath,
    };
  });
  const next: PredictQueue = { ...queue, files };
  if (queue.batchSelectionExplicit === true) {
    const nameSet = new Set(predictQueueAudioFiles(next).map((f) => f.name));
    return {
      ...next,
      selectedNames: queue.selectedNames.filter((n) => nameSet.has(n)),
      batchSelectionExplicit: true,
    };
  }
  return dropCompletedFromPredictSelection(next);
}

export function coercePredictBatchSelection(
  files: PredictQueueFile[],
  selectedNames: string[],
  explicit: boolean,
): string[] {
  const fileNames = new Set(files.map((f) => f.name));
  const valid = selectedNames.filter((n) => fileNames.has(n));
  if (explicit) return valid;
  if (valid.length === 0) return defaultPredictBatchSelection(files);
  const withoutCompleted = valid.filter((n) => {
    const file = files.find((f) => f.name === n);
    return file != null && isDefaultPredictBatchCandidate(file);
  });
  return withoutCompleted.length > 0
    ? withoutCompleted
    : defaultPredictBatchSelection(files);
}

/** Names effectively selected for batch predict (checkboxes + defaults). */
export function batchSelectedNames(queue: PredictQueue): string[] {
  const wavFiles = predictQueueAudioFiles(queue);
  const nameSet = new Set(wavFiles.map((f) => f.name));
  const selected = queue.selectedNames.filter((n) => nameSet.has(n));
  if (queue.batchSelectionExplicit) return selected;
  return selected.length > 0
    ? coercePredictBatchSelection(wavFiles, selected, false)
    : defaultPredictBatchSelection(wavFiles);
}

export function isFileSelectedForPredict(
  queue: PredictQueue,
  name: string,
): boolean {
  return batchSelectedNames(queue).includes(name);
}

export function sanitizePredictQueue(queue: PredictQueue): PredictQueue {
  const files = predictQueueAudioFiles(queue);
  const explicit = queue.batchSelectionExplicit === true;
  const selectedNames = coercePredictBatchSelection(
    files,
    queue.selectedNames,
    explicit,
  );
  const activeStill = files.some((f) => f.name === queue.activeFileName);
  return {
    ...queue,
    files,
    activeFileName: activeStill
      ? queue.activeFileName
      : (files[0]?.name ?? null),
    batchSelectionExplicit: explicit,
    selectedNames,
  };
}

