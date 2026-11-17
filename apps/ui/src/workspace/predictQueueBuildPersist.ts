import type { ProjectRecord } from "../api/projects";
import { loadWorkspace, saveWorkspace } from "./storage";
import {
  isPredictQueueAudioFile,
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
  type PredictQueueFileKind,
} from "./predictQueueTypes";
import {
  defaultPredictBatchSelection,
  sanitizePredictQueue,
} from "./predictQueueSelection";
import { mergeFileIntoQueue } from "./predictQueueBuildCore";

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function fileKind(path: string): PredictQueueFileKind {
  return path.toLowerCase().endsWith(".csv") ? "csv_table" : "wav";
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
