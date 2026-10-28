import type { ProjectRecord, ProjectRecording } from "../api/projects";
import { inferPredictedLabelPath } from "../lib/predictLabels";
import { loadWorkspace, saveWorkspace } from "./storage";

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

function coercePredictBatchSelection(
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

export function recordingToQueueFile(
  rec: ProjectRecording,
  prev?: PredictQueueFile,
): PredictQueueFile {
  return {
    name: rec.name,
    path: rec.path,
    kind: "wav",
    bit_depth: rec.bit_depth,
    sample_rate_hz: rec.sample_rate_hz,
    duration_sec: rec.duration_sec ?? prev?.duration_sec ?? null,
    size_bytes: rec.size_bytes ?? null,
    status: prev?.status ?? "pending",
    labelPath: prev?.labelPath,
    filteredPath: prev?.filteredPath,
    compareLabelPath: prev?.compareLabelPath,
    error: prev?.error,
  };
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function fileKind(path: string): PredictQueueFileKind {
  return path.toLowerCase().endsWith(".csv") ? "csv_table" : "wav";
}

export function buildPredictQueue(
  project: ProjectRecord,
  recordings: ProjectRecording[],
  selectedNames: Iterable<string>,
): PredictQueue | null {
  if (!recordings.length) return null;
  const names = new Set(selectedNames);
  // Always list every project WAV; Projects selection only pre-checks the subset.
  const files: PredictQueueFile[] = recordings.map((r) =>
    recordingToQueueFile(r),
  );
  const selected = files
    .filter((f) => recordingNameMatchesSelection(f.name, names))
    .map((f) => f.name);
  if (!selected.length) return null;
  return {
    projectId: project.id,
    projectDir: project.path,
    projectName: project.display_name,
    files,
    activeFileName: selected[0]!,
    selectedNames: selected,
    // Rows checked in Projects are intentional — keep done/filtered for re-run.
    batchSelectionExplicit: true,
  };
}

export function buildPredictQueueFromTable(
  project: ProjectRecord,
  tablePath: string,
): PredictQueue {
  const name = basename(tablePath);
  return {
    projectId: project.id,
    projectDir: project.path,
    projectName: project.display_name,
    files: [
      {
        name,
        path: tablePath,
        kind: "csv_table",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
      },
    ],
    activeFileName: name,
    selectedNames: [name],
    batchSelectionExplicit: false,
  };
}

export function mergeFileIntoQueue(
  queue: PredictQueue | null,
  file: PredictQueueFile,
  workspace: {
    activeProjectId: string | null;
    projectDir: string | null;
    projectName: string | null;
  },
  options?: { resetStatus?: boolean },
): PredictQueue {
  const base: PredictQueue = queue ?? {
    projectId: workspace.activeProjectId ?? "",
    projectDir: workspace.projectDir ?? "",
    projectName: workspace.projectName ?? undefined,
    files: [],
    activeFileName: null,
    selectedNames: [],
  };

  const existingIdx = base.files.findIndex((f) => f.path === file.path);
  const files =
    existingIdx >= 0
      ? base.files.map((f, i) =>
          i === existingIdx
            ? {
                ...f,
                ...file,
                status: options?.resetStatus ? file.status : f.status,
              }
            : f,
        )
      : [...base.files, file];

  const selected = new Set(base.selectedNames);
  const mergedStatus =
    existingIdx >= 0 && !options?.resetStatus
      ? base.files[existingIdx]!.status
      : file.status;
  if (
    isDefaultPredictBatchCandidate({
      ...file,
      status: mergedStatus,
    })
  ) {
    selected.add(file.name);
  }

  return {
    ...base,
    files,
    activeFileName: file.name,
    selectedNames: [...selected],
  };
}

export type PredictNavState = {
  wavPath?: string;
  labelPath?: string;
  compareLabelPath?: string;
  recordingPath?: string;
  recordingKind?: string;
};

export function queueFromNavigation(
  state: PredictNavState | null | undefined,
  workspace: {
    activeProjectId: string | null;
    projectDir: string | null;
    projectName: string | null;
  },
): PredictQueue | null {
  if (!state) return null;

  const wav =
    state.wavPath ??
    (state.recordingPath && !state.recordingPath.toLowerCase().endsWith(".csv")
      ? state.recordingPath
      : undefined);
  if (!wav) return null;

  const name = basename(wav);
  return mergeFileIntoQueue(
    loadPredictQueue(workspace.activeProjectId),
    {
      name,
      path: wav,
      kind: "wav",
      bit_depth: null,
      sample_rate_hz: null,
      duration_sec: null,
      status: "pending",
      labelPath: state.labelPath,
      compareLabelPath: state.compareLabelPath,
    },
    workspace,
  );
}

/** Merge project WAV list into queue; keep per-file job state (audio files only). */
export function syncQueueWithProjectRecordings(
  project: ProjectRecord,
  recordings: ProjectRecording[],
  prev: PredictQueue | null,
): PredictQueue {
  const prevByPath = new Map(
    (prev?.projectId === project.id ? prev.files : [])
      .filter(isPredictQueueAudioFile)
      .map((f) => [f.path, f]),
  );
  const prevWavs =
    prev?.projectId === project.id
      ? prev.files.filter(isPredictQueueAudioFile)
      : [];
  const recordingPaths = new Set(recordings.map((r) => r.path));

  // Always sync the full project recording list. Selection (checkboxes) is
  // independent — a Projects seed pre-checks a subset without hiding the rest.
  const wavFromProject = recordings.map((rec) => {
    const old = prevByPath.get(rec.path) ?? prevByPath.get(rec.name);
    return recordingToQueueFile(rec, old);
  });
  // Expert / out-of-project paths: keep until user removes (not dropped on server sync).
  const projectDirNorm = project.path.replace(/\\/g, "/").replace(/\/$/, "");
  const isUnderProjectDir = (filePath: string) => {
    const fp = filePath.replace(/\\/g, "/");
    return fp === projectDirNorm || fp.startsWith(`${projectDirNorm}/`);
  };
  const externalWavs = prevWavs.filter(
    (f) => !recordingPaths.has(f.path) && !isUnderProjectDir(f.path),
  );
  const files = [...wavFromProject, ...externalWavs];
  const sameProject = prev?.projectId === project.id;
  const explicit = sameProject && prev?.batchSelectionExplicit === true;
  const fileNames = new Set(files.map((f) => f.name));
  let selectedNames: string[];
  if (!sameProject) {
    selectedNames = defaultPredictBatchSelection(files);
  } else if (explicit) {
    selectedNames = prev!.selectedNames.filter((n) => fileNames.has(n));
  } else {
    selectedNames = coercePredictBatchSelection(
      files,
      prev!.selectedNames.filter((n) => fileNames.has(n)),
      false,
    );
  }
  const activeStill = files.some((f) => f.name === prev?.activeFileName);
  return {
    projectId: project.id,
    projectDir: project.path,
    projectName: project.display_name,
    files,
    activeFileName: activeStill
      ? prev!.activeFileName
      : (files[0]?.name ?? null),
    selectedNames,
    batchSelectionExplicit: sameProject ? explicit : false,
  };
}

/** Append newly imported recordings without expanding queue to the full project. */
/** Append import results without pulling in every project recording when queue was empty. */
export function appendImportedToQueue(
  project: ProjectRecord,
  prev: PredictQueue | null,
  newRecordings: ProjectRecording[],
): PredictQueue {
  const base: PredictQueue =
    prev && prev.projectId === project.id
      ? prev
      : {
          projectId: project.id,
          projectDir: project.path,
          projectName: project.display_name,
          files: [],
          activeFileName: null,
          selectedNames: [],
          batchSelectionExplicit: false,
        };
  return appendRecordingsToQueue(base, newRecordings);
}

export function appendRecordingsToQueue(
  queue: PredictQueue,
  newRecordings: ProjectRecording[],
): PredictQueue {
  const knownPaths = new Set(queue.files.map((f) => f.path));
  const knownNames = new Set(queue.files.map((f) => f.name));
  const added = newRecordings
    .filter((r) => !knownPaths.has(r.path) && !knownNames.has(r.name))
    .map((r) => recordingToQueueFile(r));
  if (!added.length) return queue;
  const selected = new Set(queue.selectedNames);
  for (const f of added) selected.add(f.name);
  const allFiles = [...queue.files, ...added];
  const activeStill =
    queue.activeFileName != null &&
    allFiles.some((f) => f.name === queue.activeFileName);
  return {
    ...queue,
    files: allFiles,
    activeFileName: activeStill
      ? queue.activeFileName
      : (queue.activeFileName ?? added[0]?.name ?? allFiles[0]?.name ?? null),
    selectedNames: [...selected],
  };
}

/** Select active row by WAV path; optionally attach label path from navigation. */
function queueFileMatchesWavPath(file: PredictQueueFile, wavPath: string): boolean {
  if (file.path === wavPath) return true;
  const normalized = wavPath.replace(/\\/g, "/");
  if (file.path === normalized) return true;
  const isAbs =
    normalized.startsWith("/") || /^[A-Za-z]:[/\\]/.test(normalized);
  if (isAbs) {
    return file.path.replace(/\\/g, "/") === normalized;
  }
  const base = normalized.split(/[/\\]/).pop() ?? normalized;
  return file.name === base || file.path.replace(/\\/g, "/").endsWith(`/${base}`);
}

export function activateQueueByWavPath(
  queue: PredictQueue,
  wavPath: string,
  labelPath?: string,
): PredictQueue {
  const file = queue.files.find((f) => queueFileMatchesWavPath(f, wavPath));
  if (!file) return queue;
  const files = queue.files.map((f) => {
    if (f.name !== file.name || !labelPath?.trim()) return f;
    const trimmed = labelPath.trim();
    if (/_filtered\.txt$/i.test(trimmed)) {
      return { ...f, filteredPath: trimmed };
    }
    return { ...f, labelPath: trimmed };
  });
  return { ...queue, files, activeFileName: file.name };
}

/** Drop missing WAV rows; refresh paths/metadata from current project listing. */
export function refreshQueueFromRecordings(
  queue: PredictQueue,
  recordings: ProjectRecording[],
): PredictQueue {
  return syncQueueWithProjectRecordings(
    {
      id: queue.projectId,
      path: queue.projectDir,
      display_name: queue.projectName ?? "",
      description: "",
      orcai_name: "",
      project_kind: "recognition",
      created_at: 0,
      updated_at: 0,
      recording_table_path: null,
      recordings_dir: "",
      wav_count: recordings.length,
      initialized: true,
    },
    recordings,
    queue,
  );
}

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

export function isFileSelectedForPredict(
  queue: PredictQueue,
  name: string,
): boolean {
  return batchSelectedNames(queue).includes(name);
}

export function resolveFilterPredictedPath(
  file: PredictQueueFile,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string | null {
  if (file.kind === "csv_table") {
    const direct = file.labelPath?.trim();
    if (direct && !isFilteredLabelPath(direct)) return direct;
    return null;
  }
  const stored = file.labelPath?.trim();
  if (stored && !isFilteredLabelPath(stored)) return stored;
  if (file.status === "done" || file.status === "filtered") {
    return inferPredictedLabelPath(file.path, channel, modelId, modelLabelName);
  }
  return null;
}

function normalizeQueueFile(
  f: Partial<PredictQueueFile> & { path?: string; name?: string },
): PredictQueueFile | null {
  if (typeof f.path !== "string" || typeof f.name !== "string") return null;
  let status = f.status ?? "pending";
  if (
    status !== "pending" &&
    status !== "running" &&
    status !== "done" &&
    status !== "failed" &&
    status !== "filtered"
  ) {
    return null;
  }
  if (status === "running") status = "pending";
  return {
    name: f.name,
    path: f.path,
    kind: f.kind ?? fileKind(f.path),
    bit_depth: f.bit_depth ?? null,
    sample_rate_hz: f.sample_rate_hz ?? null,
    duration_sec: f.duration_sec ?? null,
    size_bytes: f.size_bytes ?? null,
    status,
    labelPath: f.labelPath,
    filteredPath: f.filteredPath,
    compareLabelPath: f.compareLabelPath,
    error: f.error,
  };
}

/** Attach files opened before a project was selected. */
export function adoptPendingPredictQueue(
  project: ProjectRecord,
  existing: PredictQueue | null,
): PredictQueue | null {
  const ws = loadWorkspace();
  const pending = ws.pendingPredictQueue;
  if (!pending?.files?.length) {
    return existing;
  }
  let next = existing ?? {
    projectId: project.id,
    projectDir: project.path,
    projectName: project.display_name,
    files: [],
    activeFileName: null,
    selectedNames: [],
  };
  for (const file of pending.files) {
    next = mergeFileIntoQueue(next, file, {
      activeProjectId: project.id,
      projectDir: project.path,
      projectName: project.display_name,
    });
  }
  saveWorkspace({ pendingPredictQueue: null });
  return next;
}

export function loadPredictQueue(
  activeProjectId: string | null,
): PredictQueue | null {
  const ws = loadWorkspace();
  if (!activeProjectId) {
    const pending = ws.pendingPredictQueue;
    if (!pending?.files?.length) return null;
    return normalizeLoadedQueue(pending);
  }
  const raw = ws.predictQueue;
  if (!raw || !Array.isArray(raw.files)) return null;
  if (raw.projectId !== activeProjectId) return null;
  return normalizeLoadedQueue(raw);
}

function normalizeLoadedQueue(raw: PredictQueue): PredictQueue {
  const files = raw.files
    .map((f) => normalizeQueueFile(f))
    .filter((f): f is PredictQueueFile => f != null)
    .filter(isPredictQueueAudioFile);
  const explicit = raw.batchSelectionExplicit === true;
  const selectedNames = Array.isArray(raw.selectedNames)
    ? raw.selectedNames.filter((n) => files.some((f) => f.name === n))
    : [];
  const activeStill = files.some((f) => f.name === raw.activeFileName);
  return sanitizePredictQueue({
    projectId: raw.projectId ?? "",
    projectDir: raw.projectDir ?? "",
    projectName: raw.projectName,
    files,
    activeFileName: activeStill ? raw.activeFileName : (files[0]?.name ?? null),
    batchSelectionExplicit: explicit,
    selectedNames: explicit
      ? selectedNames
      : selectedNames.length
        ? selectedNames
        : defaultPredictBatchSelection(files),
  });
}

export function persistPredictQueue(queue: PredictQueue | null): PredictQueue | null {
  if (!queue) {
    saveWorkspace({ predictQueue: null });
    return null;
  }
  const sanitized = sanitizePredictQueue(queue);
  if (!sanitized.projectId) {
    saveWorkspace({ predictQueue: null, pendingPredictQueue: sanitized });
    return sanitized;
  }
  saveWorkspace({ predictQueue: sanitized, pendingPredictQueue: null });
  return sanitized;
}

export function patchPredictQueue(
  patch: Partial<PredictQueue> | ((prev: PredictQueue) => PredictQueue),
): PredictQueue | null {
  const prev = loadPredictQueue(loadWorkspace().activeProjectId);
  if (!prev) return null;
  const next =
    typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
  return persistPredictQueue(next);
}

export function patchPredictQueueFile(
  name: string,
  filePatch: Partial<PredictQueueFile>,
  current?: PredictQueue | null,
): PredictQueue | null {
  if (current) {
    const next: PredictQueue = {
      ...current,
      files: current.files.map((f) =>
        f.name === name ? { ...f, ...filePatch } : f,
      ),
    };
    return persistPredictQueue(next);
  }
  return patchPredictQueue((prev) => ({
    ...prev,
    files: prev.files.map((f) =>
      f.name === name ? { ...f, ...filePatch } : f,
    ),
  }));
}

export function setActivePredictFile(
  name: string,
  current?: PredictQueue | null,
): PredictQueue | null {
  if (current) {
    return persistPredictQueue({ ...current, activeFileName: name });
  }
  return patchPredictQueue({ activeFileName: name });
}

export function activePredictFile(queue: PredictQueue | null): PredictQueueFile | null {
  if (!queue) return null;
  const audio = predictQueueAudioFiles(queue);
  if (!audio.length) return null;
  if (queue.activeFileName) {
    const active = audio.find((f) => f.name === queue.activeFileName);
    if (active) return active;
  }
  return audio[0] ?? null;
}

export function runningPredictFile(
  queue: PredictQueue | null,
): PredictQueueFile | null {
  return queue?.files.find((f) => f.status === "running") ?? null;
}
