import type { OrcaiModel } from "../api/models";
import { inferPredictedLabelPath } from "./predictLabels";
import { predictFilesToRun } from "./predictBatch";
import {
  batchSelectedNames,
  isFilteredLabelPath,
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";

export function resolveModelLabelName(
  models: OrcaiModel[],
  modelId: string,
  modelDir?: string,
): string | undefined {
  const m = models.find(
    (x) => x.id === modelId || (modelDir != null && modelDir !== "" && x.path === modelDir),
  );
  return m?.name;
}

export type PredictQueueUnavailableReason =
  | "no_project"
  | "project_missing"
  | "not_initialized";

export function resolveQueueUnavailable(params: {
  hasActiveProject: boolean;
  queueLoading: boolean;
  projectLoadFailed: boolean;
  projectInitialized?: boolean;
}): PredictQueueUnavailableReason | null {
  if (!params.hasActiveProject) return "no_project";
  if (!params.queueLoading && params.projectLoadFailed) return "project_missing";
  if (
    !params.queueLoading &&
    params.projectInitialized === false
  ) {
    return "not_initialized";
  }
  return null;
}

/** True while project queue is loading — show spinner, hide file table. */
export function shouldShowQueueLoading(params: {
  hasActiveProject: boolean;
  queueLoading: boolean;
  queueUnavailable: PredictQueueUnavailableReason | null;
}): boolean {
  return (
    params.hasActiveProject &&
    params.queueLoading &&
    params.queueUnavailable == null
  );
}

export function isRecognitionComplete(file: PredictQueueFile): boolean {
  return (
    file.kind === "wav" &&
    (file.status === "done" || file.status === "filtered")
  );
}

/** Results strip / spectrogram: completed or currently recognizing. */
export function isPredictResultBrowsable(file: PredictQueueFile): boolean {
  return (
    file.kind === "wav" &&
    (file.status === "done" ||
      file.status === "filtered" ||
      file.status === "running")
  );
}

export type SpectrogramNavState = {
  wavPath: string;
  labelPath?: string;
};

export function labelPathForQueueFile(
  file: PredictQueueFile,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string | undefined {
  const direct = storedLabelPathForQueueFile(file);
  if (direct) return direct;
  if (isRecognitionComplete(file)) {
    return inferPredictedLabelPath(file.path, channel, modelId, modelLabelName);
  }
  return undefined;
}

/** Label path stored on the queue row (not inferred from WAV name). */
export function storedLabelPathForQueueFile(
  file: PredictQueueFile,
): string | undefined {
  const direct = file.filteredPath ?? file.labelPath;
  return direct?.trim() || undefined;
}

export type AnalysisLabelKind = "original" | "filtered";

export { isFilteredLabelPath };

export function filteredLabelPathForQueueFile(
  file: PredictQueueFile,
): string | undefined {
  const direct = file.filteredPath?.trim();
  return direct || undefined;
}

/** Original `*_predicted.txt` — never the filtered sidecar file. */
export function originalLabelPathForQueueFile(
  file: PredictQueueFile,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string | undefined {
  const direct = file.labelPath?.trim();
  if (direct && !isFilteredLabelPath(direct)) return direct;
  if (isRecognitionComplete(file)) {
    return inferPredictedLabelPath(file.path, channel, modelId, modelLabelName);
  }
  return undefined;
}

export function defaultAnalysisLabelKind(
  file: PredictQueueFile | null | undefined,
): AnalysisLabelKind {
  if (file && filteredLabelPathForQueueFile(file)) return "filtered";
  return "original";
}

/** Path for Analysis spectrogram/table given the original/filtered switch. */
export function resolveAnalysisLabelPath(
  file: PredictQueueFile,
  kind: AnalysisLabelKind,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string | undefined {
  if (kind === "filtered") {
    return (
      filteredLabelPathForQueueFile(file) ??
      originalLabelPathForQueueFile(file, channel, modelId, modelLabelName)
    );
  }
  return originalLabelPathForQueueFile(file, channel, modelId, modelLabelName);
}

function fileMissingLabels(
  f: PredictQueueFile,
  _channel: number,
  _modelId: string,
  _modelLabelName?: string,
): boolean {
  return isRecognitionComplete(f) && !storedLabelPathForQueueFile(f);
}

/** WAV recognized (done/filtered) but no resolvable label path. */
export function hasRecognizedWithoutLabels(
  queue: PredictQueue | null,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): boolean {
  if (!queue) return false;
  return queue.files.some((f) => fileMissingLabels(f, channel, modelId, modelLabelName));
}

/** Same check, limited to package file names (stable package order). */
export function hasRecognizedWithoutLabelsInFiles(
  queue: PredictQueue | null,
  fileNames: string[],
  channel: number,
  modelId: string,
  modelLabelName?: string,
): boolean {
  if (!queue || fileNames.length === 0) return false;
  return packageQueueFiles(queue, fileNames).some((f) =>
    fileMissingLabels(f, channel, modelId, modelLabelName),
  );
}

export function canOpenSpectrogramForFile(
  file: PredictQueueFile,
  _channel: number,
  _modelId: string,
  _modelLabelName?: string,
): boolean {
  // WAV plot is available while recognizing; labels appear when done.
  return isPredictResultBrowsable(file);
}

export function canOpenSpectrogramView(
  queue: PredictQueue | null,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): boolean {
  return pickSpectrogramNavTarget(queue, channel, modelId, modelLabelName) !== null;
}

export function pickSpectrogramNavTarget(
  queue: PredictQueue | null,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): SpectrogramNavState | null {
  if (!queue) return null;
  const eligible = (f: PredictQueueFile) => isPredictResultBrowsable(f);

  const preferred =
    queue.files.find(
      (f) => eligible(f) && f.name === queue.activeFileName,
    ) ?? queue.files.find(eligible);
  if (!preferred) return null;
  return {
    wavPath: preferred.path,
    labelPath:
      labelPathForQueueFile(preferred, channel, modelId, modelLabelName) ?? "",
  };
}

export function predictResultsTabEnabled(
  queue: PredictQueue | null,
  queueReady: boolean,
): boolean {
  if (!queueReady || !queue) return false;
  return predictQueueAudioFiles(queue).some(isPredictResultBrowsable);
}

/** Spectrogram tab: project queue has WAV files and is ready. */
export function spectrogramTabEnabled(
  queue: PredictQueue | null,
  queueReady: boolean,
): boolean {
  if (!queueReady || !queue) return false;
  return predictQueueAudioFiles(queue).length > 0;
}

/** WAV rows from the queue that belong to a package (stable package order). */
export function packageQueueFiles(
  queue: PredictQueue,
  fileNames: string[],
): PredictQueueFile[] {
  const byName = new Map(
    queue.files.filter((f) => f.kind === "wav").map((f) => [f.name, f]),
  );
  return fileNames
    .map((n) => byName.get(n))
    .filter((f): f is PredictQueueFile => f != null);
}

/** Prefer labeled file in package (active if labeled), else first labeled, else first WAV. */
export function pickPackageFileForSpectrogram(
  queue: PredictQueue,
  fileNames: string[],
  _channel: number,
  _modelId: string,
  _modelLabelName?: string,
): string | null {
  const files = packageQueueFiles(queue, fileNames);
  if (!files.length) return null;

  const hasStoredLabels = (f: PredictQueueFile) =>
    isRecognitionComplete(f) && Boolean(storedLabelPathForQueueFile(f));

  const labeled = files.filter(hasStoredLabels);
  if (queue.activeFileName) {
    const activeLabeled = labeled.find((f) => f.name === queue.activeFileName);
    if (activeLabeled) return activeLabeled.name;
  }
  if (labeled[0]) return labeled[0].name;

  if (
    queue.activeFileName &&
    files.some((f) => f.name === queue.activeFileName)
  ) {
    return queue.activeFileName;
  }

  return files[0]?.name ?? null;
}

/** Restrict queue table to files belonging to an analysis package. */
export function filterQueueToPackageFiles(
  queue: PredictQueue,
  fileNames: string[],
): PredictQueue {
  const allowed = new Set(fileNames);
  const files = queue.files.filter((f) => allowed.has(f.name));
  const fileNameSet = new Set(files.map((f) => f.name));
  const activeStill = files.some((f) => f.name === queue.activeFileName);
  return {
    ...queue,
    files,
    activeFileName: activeStill
      ? queue.activeFileName
      : (files[0]?.name ?? null),
    selectedNames: queue.selectedNames.filter((n) => fileNameSet.has(n)),
  };
}

/** Files eligible for batch predict (selected WAV rows, excluding running). */
export function pendingBatchPredictFiles(queue: PredictQueue): PredictQueueFile[] {
  return predictFilesToRun(queue, batchSelectedNames(queue));
}
