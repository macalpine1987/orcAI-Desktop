import type { ProjectRecord, ProjectRecording } from "../api/projects";
import {
  isDefaultPredictBatchCandidate,
  isPredictQueueAudioFile,
  recordingNameMatchesSelection,
  type PredictQueue,
  type PredictQueueFile,
} from "./predictQueueTypes";
import {
  coercePredictBatchSelection,
  defaultPredictBatchSelection,
} from "./predictQueueSelection";

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

