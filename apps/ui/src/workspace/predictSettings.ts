import type { PredictJobParams } from "../api/jobs";
import { predictJobModelParams } from "../api/predictModel";
import type { OrcaiModel } from "../api/models";
import { joinFsPath } from "../lib/joinFsPath";
import { loadWorkspace, saveWorkspace } from "./storage";

export type PredictSettings = {
  model: string;
  modelDir?: string;
  channel: number;
  threshold: number;
  outputPath: string;
  overwrite: boolean;
  saveProbabilities: boolean;
  /** Explicit `-cdl` opt-in. A leftover JSON path must not turn this on. */
  callDurationFilter: boolean;
  callDurationLimits: string;
  /** Last project dir used to auto-fill limits (re-fill when project changes). */
  callDurationLimitsProjectDir: string | null;
  labelSuffix: string;
  baseDirRecording: string;
  verbosity: 0 | 1 | 2 | 3;
  additionalOpen: boolean;
};

export type FilterSettings = {
  outputFile: string;
  overwrite: boolean;
};

export const DEFAULT_PREDICT_SETTINGS: PredictSettings = {
  model: "orcai-isl-v1",
  channel: 1,
  threshold: 0.5,
  outputPath: "default",
  overwrite: false,
  saveProbabilities: false,
  callDurationFilter: false,
  callDurationLimits: "",
  callDurationLimitsProjectDir: null,
  labelSuffix: "*",
  baseDirRecording: "",
  verbosity: 2,
  additionalOpen: false,
};

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  outputFile: "default",
  overwrite: false,
};

export function projectCallDurationLimitsPath(
  projectDir: string,
  orcaiName: string | null | undefined,
): string {
  const basename =
    orcaiName?.trim() ||
    projectDir
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ||
    "project";
  return joinFsPath(projectDir, `${basename}_call_duration_limits.json`);
}

export function loadPredictSettings(): PredictSettings {
  const ws = loadWorkspace();
  const raw = ws.predictSettings;
  if (!raw) return { ...DEFAULT_PREDICT_SETTINGS };
  const callDurationFilter = raw.callDurationFilter === true;
  return {
    ...DEFAULT_PREDICT_SETTINGS,
    ...raw,
    channel: Number(raw.channel) || 1,
    threshold:
      typeof raw.threshold === "number" ? raw.threshold : DEFAULT_PREDICT_SETTINGS.threshold,
    verbosity: ([0, 1, 2, 3] as const).includes(raw.verbosity as 0)
      ? (raw.verbosity as 0 | 1 | 2 | 3)
      : 2,
    callDurationFilter,
    callDurationLimits: callDurationFilter
      ? String(raw.callDurationLimits ?? "")
      : "",
  };
}

export function savePredictSettings(patch: Partial<PredictSettings>): PredictSettings {
  const next = { ...loadPredictSettings(), ...patch };
  saveWorkspace({ predictSettings: next });
  return next;
}

export function loadFilterSettings(): FilterSettings {
  const raw = loadWorkspace().filterSettings;
  return raw ? { ...DEFAULT_FILTER_SETTINGS, ...raw } : { ...DEFAULT_FILTER_SETTINGS };
}

/** Initial predict settings merged with optional navigation overrides. */
export function initialPredictSettings(
  navModel?: string,
  navModelDir?: string,
): PredictSettings {
  const s = loadPredictSettings();
  if (navModel !== undefined) {
    return { ...s, model: navModel, modelDir: navModelDir };
  }
  return s;
}

export function saveFilterSettings(patch: Partial<FilterSettings>): FilterSettings {
  const next = { ...loadFilterSettings(), ...patch };
  saveWorkspace({ filterSettings: next });
  return next;
}

/**
 * When the queue project changes: drop a foreign recordings dir, stamp the
 * project, and retarget `-cdl` only if the on-the-fly filter is already on.
 * An empty path stays empty — selecting a project must not enable `-cdl`.
 */
export function applyProjectCallDurationLimits(
  settings: PredictSettings,
  projectDir: string | null | undefined,
  orcaiName: string | null | undefined,
): PredictSettings {
  if (!projectDir) return settings;
  if (settings.callDurationLimitsProjectDir === projectDir) return settings;
  const cdlOn = settings.callDurationFilter === true;
  return {
    ...settings,
    callDurationFilter: cdlOn,
    callDurationLimits: cdlOn
      ? projectCallDurationLimitsPath(projectDir, orcaiName)
      : "",
    callDurationLimitsProjectDir: projectDir,
    // Global predict settings used to keep another project's recordings dir;
    // orcAI then overrides every CSV row → FileNotFoundError (logged as ": 2").
    baseDirRecording: "",
  };
}

export function buildPredictJobParams(
  settings: PredictSettings,
  filePath: string,
  projectDir: string | undefined,
  model: string,
  models: OrcaiModel[],
  modelDirHint?: string,
  extras?: { recordingNames?: string[] },
): PredictJobParams {
  const body: PredictJobParams = {
    recording_path: filePath,
    ...predictJobModelParams(model, models, { modelDir: modelDirHint }),
    channel: settings.channel,
    threshold: settings.threshold,
    output_path: settings.outputPath.trim() || "default",
    overwrite: settings.overwrite,
    save_probabilities: settings.saveProbabilities,
    label_suffix: settings.labelSuffix.trim(),
    verbosity: settings.verbosity,
    project_dir: projectDir,
  };
  const limits = settings.callDurationLimits.trim();
  if (settings.callDurationFilter && limits) {
    body.call_duration_limits = limits;
  }
  // CSV tables already carry base_dir_recording per row. Passing a stale
  // settings override rewrites every path in orcAI and breaks the batch.
  const isCsv = /\.csv$/i.test(filePath.trim());
  const baseDir = settings.baseDirRecording.trim();
  if (baseDir && !isCsv) {
    body.base_dir_recording = baseDir;
  }
  if (extras?.recordingNames?.length) {
    body.recording_names = extras.recordingNames;
  }
  return body;
}
