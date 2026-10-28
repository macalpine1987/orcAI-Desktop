import { getSidecarBase } from "./sidecar";
import { withJobVerbosity } from "../lib/integrationSettings";
import { notifyProjectParametersSaved } from "../lib/projectParametersEvents";
import type { JobRecord } from "./jobs";
import { normalizeProjectKind } from "../lib/projectKind";

export type ProjectKind = "recognition" | "training";

/** Soft focus (FR-2.14): hints and quick actions. Recognition focus also makes the Training section inactive. */
export type ProjectFocus = "recognition" | "training" | "full";

export const PROJECT_FOCUSES: readonly ProjectFocus[] = [
  "recognition",
  "training",
  "full",
];

export type ProjectRecord = {
  id: string;
  path: string;
  display_name: string;
  description: string;
  orcai_name: string;
  project_kind: ProjectKind;
  /** Stored Desktop focus; `null` when the project was never given one (CLI project). */
  focus?: ProjectFocus | null;
  focus_source?: "stored" | "inferred";
  created_at: number;
  updated_at: number;
  recording_table_path: string | null;
  recordings_dir: string;
  wav_count: number;
  initialized: boolean;
  /** When true, Desktop auto-runs create-recording-table after add/delete. Default false. */
  auto_sync_recording_table?: boolean;
  /** Per-project predict model id (builtin or trained). */
  predict_model?: string | null;
  /** Directory for trained models; null/omitted for builtins. */
  predict_model_dir?: string | null;
  /** Analysis spectrogram map. Null until the user picks one; UI default is Greys. */
  spectrogram_colormap?: string | null;
  manifest?: Record<string, unknown>;
  imported?: Array<{ source: string; dest: string; name: string }>;
};

function normalizeProjectRecord(project: ProjectRecord): ProjectRecord {
  const model =
    typeof project.predict_model === "string" ? project.predict_model.trim() : "";
  const modelDir =
    typeof project.predict_model_dir === "string"
      ? project.predict_model_dir.trim()
      : "";
  return {
    ...project,
    project_kind: normalizeProjectKind(project.project_kind),
    auto_sync_recording_table: project.auto_sync_recording_table ?? true,
    predict_model: model || null,
    predict_model_dir: modelDir || null,
  };
}

export type ProjectRecording = {
  name: string;
  path: string;
  rel_path: string;
  size_bytes: number;
  modified_at: number;
  sample_rate_hz: number | null;
  bit_depth: number | null;
  duration_sec: number | null;
  meta_error?: boolean;
};

export type ProjectNameConflict = {
  reason: string;
  display_name?: string;
  path?: string;
  id?: string;
  suggest_register?: boolean;
};

export type ProjectNameCheckResult = {
  available: boolean;
  conflicts: ProjectNameConflict[];
  slug: string;
  project_dir: string;
};

export class ProjectNameTakenError extends Error {
  readonly conflicts: ProjectNameConflict[];

  constructor(conflicts: ProjectNameConflict[]) {
    super("project_name_conflict");
    this.name = "ProjectNameTakenError";
    this.conflicts = conflicts;
  }
}

type ApiErrorDetail =
  | string
  | {
      code?: string;
      conflicts?: ProjectNameConflict[];
      message?: string;
    };

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: ApiErrorDetail };
    const detail = json.detail;
    if (
      res.status === 409 &&
      detail &&
      typeof detail === "object" &&
      detail.code === "project_name_conflict" &&
      Array.isArray(detail.conflicts)
    ) {
      throw new ProjectNameTakenError(detail.conflicts);
    }
    const message =
      typeof detail === "string"
        ? detail
        : (detail?.message ?? text);
    throw new Error(message || res.statusText);
  } catch (err) {
    if (err instanceof ProjectNameTakenError || err instanceof Error) {
      throw err;
    }
    throw new Error(text || res.statusText);
  }
}

export async function checkProjectNameAvailable(
  parent_dir: string,
  display_name: string,
  exclude_id?: string,
  opts?: { displayNameOnly?: boolean },
): Promise<ProjectNameCheckResult> {
  const url = new URL(`${getSidecarBase()}/v1/projects/check-name`);
  url.searchParams.set("parent_dir", parent_dir);
  url.searchParams.set("display_name", display_name);
  if (exclude_id) {
    url.searchParams.set("exclude_id", exclude_id);
  }
  if (opts?.displayNameOnly) {
    url.searchParams.set("display_name_only", "true");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectNameCheckResult;
}

export async function fetchProjects(): Promise<ProjectRecord[]> {
  const res = await fetch(`${getSidecarBase()}/v1/projects`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { projects: ProjectRecord[] };
  return data.projects.map(normalizeProjectRecord);
}

export async function fetchProject(id: string): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export type ProjectReadinessState = "ready" | "needed" | "empty";

export type RecordingTableSyncStatus = "missing" | "stale" | "current";

export type ProjectNextAction =
  | "sync_table"
  | "predict"
  | "filter"
  | "annotate"
  | "create_tvt"
  | "train"
  | "results";

/** Compact file-presence counts for the shell data-health banner. */
export type ProjectDataHealth = {
  table_stale: boolean;
  missing_wav: number;
  unpaired_ann: number;
  ann_gap: number;
};

export type ProjectSummary = {
  project_id: string;
  display_name: string;
  project_kind: ProjectKind;
  focus: ProjectFocus;
  focus_source?: "stored" | "inferred";
  metrics: {
    recordings: number;
    annotations: number;
    predicted: number;
    trained_models: number;
    recordings_total: number;
    annotations_total: number;
  };
  primary_model_name: string | null;
  recording_table: {
    path: string | null;
    sync_status: RecordingTableSyncStatus;
  };
  /** Mirrors project setting; default false when absent. */
  auto_sync_recording_table?: boolean;
  predict_model?: string | null;
  predict_model_dir?: string | null;
  readiness: {
    recordings: ProjectReadinessState;
    annotations: ProjectReadinessState;
    predict: ProjectReadinessState;
    datasets: ProjectReadinessState;
    model: ProjectReadinessState;
  };
  readiness_lines: {
    recordings: {
      state: ProjectReadinessState;
      wav_count: number;
      table_rows: number;
    };
    annotations: {
      state: ProjectReadinessState;
      annotated: number;
      total: number;
      /** Manual .txt files paired to a WAV. Absent on older sidecars. */
      paired_files?: number;
    };
    predict: {
      state: ProjectReadinessState;
      predicted: number;
      total: number;
    };
    datasets: {
      state: ProjectReadinessState;
      file_count: number;
      has_tvt_dir: boolean;
    };
    model: {
      state: ProjectReadinessState;
      checkpoint_count: number;
      model_name: string | null;
    };
  };
  /** Advisory file gaps for shell banner (optional on older sidecars). */
  data_health?: ProjectDataHealth;
  next_actions: ProjectNextAction[];
};

export async function fetchProjectSummary(id: string): Promise<ProjectSummary> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/summary`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ProjectSummary;
}

export type CreateProjectParams = {
  parent_dir: string;
  display_name: string;
  description?: string;
  orcai_name?: string;
  import_paths?: string[];
  project_kind?: ProjectKind;
  focus?: ProjectFocus;
};

export async function createProject(
  params: CreateProjectParams,
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "",
      import_paths: [],
      ...params,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function registerProject(
  path: string,
  display_name?: string,
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, display_name }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function updateProject(
  id: string,
  patch: {
    display_name?: string;
    description?: string;
    focus?: ProjectFocus;
    auto_sync_recording_table?: boolean;
    predict_model?: string;
    predict_model_dir?: string | null;
    spectrogram_colormap?: string;
  },
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function deleteProject(
  id: string,
  delete_files = false,
): Promise<void> {
  const url = new URL(`${getSidecarBase()}/v1/projects/${id}`);
  url.searchParams.set("delete_files", String(delete_files));
  const res = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchProjectRecordings(
  id: string,
): Promise<ProjectRecording[]> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recordings`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { recordings: ProjectRecording[] };
  return data.recordings;
}

export type ImportedRecordingRow = {
  source: string;
  dest: string;
  name: string;
  kind?: "wav";
  sample_rate_hz?: number;
  bit_depth?: number | null;
};

export type ImportFailedRow = { path: string; error: string };

export type ImportRecordingsJobResponse = {
  job_id: string;
  job: JobRecord;
  imported: ImportedRecordingRow[];
  failed?: ImportFailedRow[];
  count: number;
};

/** Queue background import (WAV copy into recordings/). */
export async function importProjectRecordingsJob(
  id: string,
  paths: string[],
): Promise<{ job_id: string; job: JobRecord; async: boolean }> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recordings/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as {
    job_id: string;
    job: JobRecord;
    async?: boolean;
  };
  return { job_id: data.job_id, job: data.job, async: data.async ?? true };
}

/** @deprecated Use importProjectRecordingsJob + wait; kept for tests calling sync path. */
export async function importProjectRecordings(
  id: string,
  paths: string[],
): Promise<{ imported: ImportedRecordingRow[]; count: number }> {
  const { job } = await importProjectRecordingsJob(id, paths);
  const { waitForJobTerminal } = await import("../lib/waitForJob");
  const finished = await waitForJobTerminal(job.id);
  if (finished.status !== "completed") {
    throw new Error(finished.error ?? "Import failed");
  }
  return {
    imported: (finished.result?.imported as ImportedRecordingRow[]) ?? [],
    count: Number(finished.result?.count ?? 0),
  };
}

export async function deleteProjectRecordings(
  id: string,
  options: { filenames?: string[]; delete_all?: boolean },
): Promise<{ deleted: string[]; count: number; skipped?: string[] }> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recordings/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filenames: options.filenames ?? [],
        delete_all: options.delete_all ?? false,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    deleted: string[];
    count: number;
    skipped?: string[];
  };
}

export async function startProjectInitJob(id: string): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/init`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as JobRecord;
}

export async function startProjectSyncTableJob(
  id: string,
  options: { overwrite?: boolean; update_table?: boolean } = {},
): Promise<JobRecord> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recordings/sync-table`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as JobRecord;
}

// ---------------------------------------------------------------- Projects tabs

export type RecordingPredictStatus = "done" | "running" | "failed" | "none";

/** One row of the «Записи» tab: CSV cells + facts computed from disk. */
export type ProjectTableRow = {
  recording: string;
  in_table: boolean;
  /** Original recording_table.csv cells (column names are orcAI's, untranslated). */
  cells: Record<string, string>;
  wav_path: string | null;
  wav_exists: boolean;
  size_bytes: number | null;
  duration_sec: number | null;
  sample_rate_hz: number | null;
  channels: number | null;
  /** Set when orcAI will resample this file (e.g. 96 kHz → 48 kHz). */
  resample_to_hz: number | null;
  annotation_path: string | null;
  annotation_exists: boolean;
  predict_status: RecordingPredictStatus;
  predicted_path: string | null;
  channel: number | null;
  duplicate: boolean;
};

export type ProjectRecordingTable = {
  project_id: string;
  table_path: string | null;
  table_exists: boolean;
  updated_at: number | null;
  columns: string[];
  standard_columns: string[];
  class_columns: string[];
  calls: string[];
  target_sampling_rate_hz: number;
  default_channel: number;
  row_count: number;
  rows: ProjectTableRow[];
};

export async function fetchProjectRecordingTable(
  id: string,
): Promise<ProjectRecordingTable> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recording-table`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectRecordingTable;
}

export async function setProjectRecordingChannel(
  id: string,
  recording: string,
  channel: number,
): Promise<{ recording: string; channel: number; table_path: string }> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recording-table/rows/${encodeURIComponent(recording)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as { recording: string; channel: number; table_path: string };
}

export type ProjectAnnotationRow = {
  recording: string;
  annotation_path: string;
  total_labels: number;
  /** `null` = class masked in recording_table.csv (empty cell), not "no calls". */
  counts: Record<string, number | null>;
};

export type ProjectUnpairedAnnotation = {
  name: string;
  path: string;
  stem: string;
  size_bytes: number;
};

export type ProjectAnnotations = {
  project_id: string;
  classes: string[];
  classes_source: "parameters" | "table" | "annotations";
  has_mask_columns: boolean;
  rows: ProjectAnnotationRow[];
  class_stats?: Array<{
    id: string;
    count: number;
    recordings: number;
    duration_sec: number;
    coverage: number;
  }>;
  unlisted_labels: string[];
  annotated_count: number;
  total_count: number;
  unpaired?: ProjectUnpairedAnnotation[];
  unpaired_count?: number;
  annotations_dir?: string | null;
};

export type ImportAnnotationsResult = {
  project_id: string;
  imported: Array<{
    source: string;
    dest: string;
    name: string;
    paired: string;
  }>;
  failed: Array<{ path: string; error: string }>;
  imported_count: number;
  paired_count: number;
  /** Folder-wide unpaired count (for the unpaired list). */
  unpaired_count: number;
  /** Unpaired among this import batch only (toast — BUG-07). */
  unpaired_imported_count?: number;
  unpaired: ProjectUnpairedAnnotation[];
  annotations_dir: string;
  /** Paired-annotation labels appended to parameter ``calls`` during this import. */
  added_calls?: string[];
};

export async function fetchProjectAnnotations(id: string): Promise<ProjectAnnotations> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations`, {
    // Large annotation trees can exceed 30s while the sidecar scans .txt files.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectAnnotations;
}

export async function importProjectAnnotations(
  id: string,
  paths: string[],
): Promise<ImportAnnotationsResult> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ImportAnnotationsResult;
}

export async function deleteProjectAnnotations(
  id: string,
  filenames: string[],
): Promise<{ removed: string[]; missing: string[]; unpaired: ProjectUnpairedAnnotation[] }> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filenames }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as {
    removed: string[];
    missing: string[];
    unpaired: ProjectUnpairedAnnotation[];
  };
}

export type ProjectArtifactItem = {
  name: string;
  path: string;
  exists: boolean;
  file_count: number;
  size_bytes: number;
  updated_at: number | null;
};

export type ProjectArtifacts = {
  project_id: string;
  project_dir: string;
  items: ProjectArtifactItem[];
  present_count: number;
};

export async function fetchProjectArtifacts(id: string): Promise<ProjectArtifacts> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/artifacts`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectArtifacts;
}

export type ParameterValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ProjectParameters = {
  project_id: string;
  path: string;
  filename: string;
  exists: boolean;
  text: string;
  updated_at: number | null;
  validation: ParameterValidation;
  saved_at?: number;
};

export async function fetchProjectParameters(id: string): Promise<ProjectParameters> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectParameters;
}

export async function validateProjectParameters(
  id: string,
  text: string,
): Promise<ParameterValidation> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ParameterValidation;
}

export async function saveProjectParameters(
  id: string,
  text: string,
): Promise<ProjectParameters> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  const saved = (await res.json()) as ProjectParameters;
  // Pipeline readiness / snippets banner must re-read disk immediately.
  notifyProjectParametersSaved(id);
  return saved;
}

/** @deprecated Use startProjectInitJob */
export type InitProjectParams = {
  project_dir: string;
  project_name: string;
};

export async function initProjectJob(
  params: InitProjectParams,
): Promise<JobRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/jobs/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withJobVerbosity({ ...params })),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`init failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as JobRecord;
}

export type PipelineStepStatus =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "stale"
  | "blocked"
  | "error";

export type PipelineArtifactKind =
  | "recordings"
  | "rows"
  | "tables"
  | "datasets"
  | "models"
  | "files";

export type PipelineStepState = {
  id: string;
  order: number;
  optional: boolean;
  status: PipelineStepStatus;
  reason: string | null;
  command: string;
  artifact_path: string;
  artifact_label: string;
  artifact_kind: PipelineArtifactKind;
  file_count: number;
  size_bytes: number;
  updated_at: number | null;
  job_id: string | null;
  job_status: string | null;
  progress: number | null;
  error: string | null;
  can_run: boolean;
  run_params: Record<string, unknown>;
};

export type PipelineReadinessLamp = "ok" | "warn" | "off" | "info";

export type PipelineActivePlan = {
  plan_id: string;
  queued: number;
  running: number;
  job_id: string | null;
  /** Commands tagged with this wizard ``plan_id`` (any job status). */
  commands?: string[];
  /** False when the wizard plan omitted optional ``hpsearch`` (default). */
  includes_hpsearch?: boolean;
};

export type ProjectPipeline = {
  project_id: string;
  project_dir: string;
  parameter_path: string;
  parameter_filename: string;
  parameter_exists: boolean;
  /** Wizard auto-run still has pending/running jobs with the same ``plan_id``. */
  active_plan?: PipelineActivePlan | null;
  steps: PipelineStepState[];
  readiness: {
    recordings: { state: PipelineReadinessLamp; rows: number; path: string | null };
    annotations: {
      state: PipelineReadinessLamp;
      annotated: number;
      total: number;
      /** WAV stems that have a matching annotation .txt. */
      paired?: number;
      /** Loaded WAV files. */
      wav_count?: number;
    };
    unlabeled: { state: PipelineReadinessLamp; count: number };
    classes: {
      state: PipelineReadinessLamp;
      found: number;
      names: string[];
      source: string;
    };
    snippets: {
      state: PipelineReadinessLamp;
      actual: number | null;
      required: number;
      n_batch: number;
      batch_size: number;
      /** Split whose shortfall drives the lamp (worst deficit). */
      split?: "train" | "val" | "test";
    };
    disk: { state: PipelineReadinessLamp; free_bytes: number; needed_bytes: number };
    accelerator: {
      state: PipelineReadinessLamp;
      gpu_available: boolean;
      backend: string;
      devices: string[];
      hint: string | null;
      /** Active engine session device (cpu|gpu); drives readiness lamp colour. */
      active_compute_device?: string | null;
    };
  };
  parameters: {
    architecture: string;
    sampling_rate: number;
    nfft: number;
    n_overlap: number;
    freq_low: number;
    freq_high: number;
    snippet_duration: number;
    snippets_per_sec: number;
    split_train: number;
    split_val: number;
    split_test: number;
    epochs: number;
    batch_size: number;
    n_batch_train: number;
  };
};

export async function fetchProjectPipeline(id: string): Promise<ProjectPipeline> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/pipeline`, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectPipeline;
}

export type SnippetSplitId = "train" | "val" | "test";

export type SnippetCalculatorSplit = {
  /** Snippets orcAI cuts before dropping empty ones. */
  total: number;
  /** Expected snippets that contain a selected class. */
  labelled: number;
  /** Estimated snippets left after fraction_removal. */
  kept: number;
  /** Exact post-filter count from an existing snippet table (same params). */
  measured: number | null;
  /** Count the suggestion is based on (measured when present). */
  available: number;
  max: number;
  suggested: number;
};

export type SnippetCalculatorResult = {
  project_id: string;
  source: "estimate" | "measured";
  batch_size: number;
  splits: Record<SnippetSplitId, SnippetCalculatorSplit>;
  recordings_annotated: number;
  recordings_used: number;
  recordings_too_short: number;
  recordings_no_duration: number;
  snippet_table: { exists: boolean; matches_params: boolean };
  safety_margin: number;
};

export type SnippetCalculatorRequest = {
  calls: string[];
  equivalences: Record<string, string>;
  snippets: Record<string, number>;
  batch_size: number;
  seed?: number | null;
};

export async function calculateProjectSnippets(
  id: string,
  body: SnippetCalculatorRequest,
  signal?: AbortSignal,
): Promise<SnippetCalculatorResult> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/snippet-calculator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as SnippetCalculatorResult;
}

export type TrainMonitorPhase =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export type TrainMonitorSnapshot = {
  project_dir: string;
  phase: TrainMonitorPhase;
  job_id: string | null;
  job_status: string | null;
  /** Raw train job error when phase/status is failed. */
  job_error?: string | null;
  model_name: string;
  model_dir: string | null;
  monitor: string;
  epoch: number;
  epochs: number;
  batch: number;
  batches: number | null;
  batch_progress: number | null;
  metrics: {
    val_MBA: number | null;
    MBA: number | null;
    loss: number | null;
    val_loss: number | null;
    learning_rate: number | null;
  };
  history: Record<string, number[]>;
  best_value: number | null;
  best_epoch: number | null;
  elapsed_sec: number | null;
  remaining_sec: number | null;
  /** Unix seconds from live callback; used for smooth elapsed/ETA in the UI. */
  started_at?: number | null;
  checkpoint: {
    path: string | null;
    size_bytes: number | null;
    mtime: number | null;
    exists: boolean;
  };
  early_stopping: {
    patience: number;
    epochs_since_best: number;
    remaining: number | null;
  };
  reduce_lr: {
    patience: number;
    epochs_since_best: number;
    in_epochs: number | null;
  };
  dataset: {
    compression: string;
    accelerator: string;
    batch_size: number;
    n_batch_train: number | null;
  };
  can_stop: boolean;
  can_open_folder: boolean;
};

export async function fetchProjectTrainMonitor(
  id: string,
): Promise<TrainMonitorSnapshot> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/train-monitor`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as TrainMonitorSnapshot;
}
