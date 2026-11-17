export type PredictQueueFileStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "filtered";

export type PredictQueueFileKind = "wav" | "csv_table";

export type PredictQueueFile = {
  name: string;
  path: string;
  kind: PredictQueueFileKind;
  bit_depth: number | null;
  sample_rate_hz: number | null;
  duration_sec: number | null;
  /** File size from project recording metadata when available. */
  size_bytes?: number | null;
  status: PredictQueueFileStatus;
  labelPath?: string;
  filteredPath?: string;
  compareLabelPath?: string;
  error?: string;
};

export type PredictQueue = {
  projectId: string;
  projectDir: string;
  projectName?: string;
  files: PredictQueueFile[];
  activeFileName: string | null;
  /** File names selected for batch recognition. */
  selectedNames: string[];
  /** When true, empty `selectedNames` means none selected (not “select all”). */
  batchSelectionExplicit?: boolean;
};

/** Predict UI lists WAV rows only; recording_table.csv is not a recognition target. */
export function isPredictQueueAudioFile(file: PredictQueueFile): boolean {
  return file.kind === "wav";
}

/** Exact case-sensitive name match (Linux: Whale.wav ≠ whale.wav). */
export function namesMatchExact(a: string, b: string): boolean {
  return a === b;
}

/**
 * Projects table selection uses CSV stems (`a`); recordings API uses filenames (`a.wav`).
 * Accept either form (and basename of a path) for predict queue matching.
 */
export function recordingNameMatchesSelection(
  recordingName: string,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.has(recordingName)) return true;
  const base = recordingName.split(/[/\\]/).pop() ?? recordingName;
  if (selected.has(base)) return true;
  if (/\.wav$/i.test(base)) {
    const stem = base.slice(0, -4);
    if (selected.has(stem)) return true;
  } else if (selected.has(`${base}.wav`)) {
    return true;
  }
  return false;
}

export function predictQueueAudioFiles(queue: PredictQueue): PredictQueueFile[] {
  return queue.files.filter(isPredictQueueAudioFile);
}

const FILTERED_LABEL_RE = /_filtered\.txt$/i;

/** True for `*_predicted_filtered.txt` (never feed this back into filter-predictions). */
export function isFilteredLabelPath(path: string | undefined | null): boolean {
  return Boolean(path?.trim() && FILTERED_LABEL_RE.test(path.trim()));
}

/**
 * Recognition output already exists (done/filtered or label paths on the row).
 * Failed rows stay eligible for retry even if an old label path remains.
 */
export function isPredictOutputPresent(file: PredictQueueFile): boolean {
  if (file.status === "done" || file.status === "filtered") return true;
  return Boolean(file.labelPath?.trim() || file.filteredPath?.trim());
}

/**
 * Default batch candidates: not yet recognized (or failed).
 * Done / filtered / labeled stay out unless the user selects them (e.g. «Select all»).
 */
export function isDefaultPredictBatchCandidate(file: PredictQueueFile): boolean {
  if (!isPredictQueueAudioFile(file)) return false;
  if (file.status === "failed") return true;
  if (file.status === "running") return false;
  return !isPredictOutputPresent(file);
}

/** Names selected by default for the next recognition run. */
