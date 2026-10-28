import type { PredictSettings } from "./predictSettings";
import {
  DEFAULT_PREDICT_SETTINGS,
  loadPredictSettings,
} from "./predictSettings";
import { loadWorkspace, saveWorkspace } from "./storage";

/** Settings stored in a named profile (predict job + related options). */
export type ModelProfileSettings = {
  model: string;
  modelDir?: string;
  channel: number;
  threshold: number;
  outputPath: string;
  overwrite: boolean;
  saveProbabilities: boolean;
  callDurationFilter: boolean;
  callDurationLimits: string;
  labelSuffix: string;
  baseDirRecording: string;
  verbosity: 0 | 1 | 2 | 3;
};

export type ModelProfile = {
  id: string;
  name: string;
  description: string;
  /** When set, preset is shown only for this Desktop project. */
  projectId?: string | null;
  settings: ModelProfileSettings;
  updatedAt: number;
};

export type ModelProfileMetaDraft = {
  name: string;
  description: string;
};

export const DEFAULT_MODEL_PROFILE_ID = "default";

/** Strip legacy built-in profile (removed — users create their own). */
function withoutLegacyDefaultProfile(profiles: ModelProfile[]): ModelProfile[] {
  return profiles.filter((p) => p.id !== DEFAULT_MODEL_PROFILE_ID);
}

function newId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function storedModelDir(value: string | null | undefined): string | undefined {
  const dir = value?.trim();
  return dir ? dir : undefined;
}

export function settingsFromPredictSettings(
  source: PredictSettings,
): ModelProfileSettings {
  const settings: ModelProfileSettings = {
    model: source.model,
    channel: source.channel,
    threshold: source.threshold,
    outputPath: source.outputPath,
    overwrite: source.overwrite,
    saveProbabilities: source.saveProbabilities,
    callDurationFilter: source.callDurationFilter === true,
    callDurationLimits: source.callDurationLimits,
    labelSuffix: source.labelSuffix,
    baseDirRecording: source.baseDirRecording,
    verbosity: source.verbosity,
  };
  const modelDir = storedModelDir(source.modelDir);
  if (modelDir) settings.modelDir = modelDir;
  return settings;
}

export function profileSettingsToPredictSettings(
  profile: ModelProfileSettings,
  base?: PredictSettings,
): PredictSettings {
  const prev = base ?? loadPredictSettings();
  return {
    ...prev,
    ...profile,
    modelDir: storedModelDir(profile.modelDir),
    callDurationFilter: profile.callDurationFilter === true,
    callDurationLimitsProjectDir: prev.callDurationLimitsProjectDir,
    additionalOpen: prev.additionalOpen,
  };
}

/** Fields for the Predict screen: the active preset, unless navigation passed a model. */
export function draftSettingsForActiveProfile(nav?: {
  model?: string;
  modelDir?: string | null;
}): PredictSettings {
  const stored = loadPredictSettings();
  const id = loadActiveModelProfileId();
  const profile = id ? getModelProfile(loadModelProfiles(), id) : undefined;
  const draft = profile
    ? profileSettingsToPredictSettings(profile.settings, stored)
    : stored;
  if (!nav || nav.model === undefined) return draft;
  const next: PredictSettings = { ...draft, model: nav.model };
  if ("modelDir" in nav) next.modelDir = storedModelDir(nav.modelDir);
  return next;
}

/** Save replaces settings and updatedAt. projectId stays as stored. */
export function profileWithSavedSettings(
  profile: ModelProfile,
  settings: ModelProfileSettings,
  updatedAt = Date.now(),
): ModelProfile {
  return {
    ...profile,
    settings: normalizeProfileSettings(settings),
    updatedAt,
  };
}

export function normalizeProfileSettings(
  raw: Partial<ModelProfileSettings> | undefined,
): ModelProfileSettings {
  const d = DEFAULT_PREDICT_SETTINGS;
  const merged = { ...settingsFromPredictSettings(d), ...raw };
  const modelDir = storedModelDir(merged.modelDir);
  const next: ModelProfileSettings = {
    ...merged,
    callDurationFilter: merged.callDurationFilter === true,
    channel: Math.max(1, Math.floor(Number(merged.channel)) || 1),
    threshold:
      typeof merged.threshold === "number"
        ? merged.threshold
        : d.threshold,
    verbosity: ([0, 1, 2, 3] as const).includes(merged.verbosity as 0)
      ? (merged.verbosity as 0 | 1 | 2 | 3)
      : 2,
  };
  if (modelDir) next.modelDir = modelDir;
  else delete next.modelDir;
  return next;
}

function migrateProfilesFromLegacy(): ModelProfile[] {
  // Legacy predict settings remain in `predictSettings`; no auto-created profile.
  return [];
}

export function loadModelProfiles(): ModelProfile[] {
  const ws = loadWorkspace();
  const raw = ws.predictModelProfiles;
  if (!Array.isArray(raw) || raw.length === 0) {
    return migrateProfilesFromLegacy();
  }
  const parsed: ModelProfile[] = [];
  for (const p of raw) {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") {
      continue;
    }
    const projectIdRaw = (p as { projectId?: string | null }).projectId;
    const profile: ModelProfile = {
      id: p.id,
      name: p.name,
      description:
        typeof (p as { description?: string }).description === "string"
          ? (p as { description?: string }).description!
          : "",
      settings: normalizeProfileSettings(p.settings),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
    };
    if (typeof projectIdRaw === "string") {
      profile.projectId = projectIdRaw;
    } else if (projectIdRaw === null) {
      profile.projectId = null;
    }
    parsed.push(profile);
  }
  return withoutLegacyDefaultProfile(parsed);
}

export function loadActiveModelProfileId(): string | null {
  const ws = loadWorkspace();
  const profiles = loadModelProfiles();
  const id = ws.activePredictProfileId;
  if (id && id !== DEFAULT_MODEL_PROFILE_ID && profiles.some((p) => p.id === id)) {
    return id;
  }
  return profiles[0]?.id ?? null;
}

export function persistModelProfiles(
  profiles: ModelProfile[],
  activeProfileId: string | null,
): void {
  saveWorkspace({
    predictModelProfiles: profiles,
    activePredictProfileId: activeProfileId,
  });
}

export function getModelProfile(
  profiles: ModelProfile[],
  id: string,
): ModelProfile | undefined {
  return profiles.find((p) => p.id === id);
}

export function profileSettingsEqual(
  a: ModelProfileSettings,
  b: ModelProfileSettings,
): boolean {
  return (
    a.model === b.model &&
    a.modelDir === b.modelDir &&
    a.channel === b.channel &&
    a.threshold === b.threshold &&
    a.outputPath === b.outputPath &&
    a.overwrite === b.overwrite &&
    a.saveProbabilities === b.saveProbabilities &&
    a.callDurationFilter === b.callDurationFilter &&
    a.callDurationLimits === b.callDurationLimits &&
    a.labelSuffix === b.labelSuffix &&
    a.baseDirRecording === b.baseDirRecording &&
    a.verbosity === b.verbosity
  );
}

export function isProfileDirty(
  profiles: ModelProfile[],
  activeProfileId: string,
  draft: ModelProfileSettings,
  metaDraft?: ModelProfileMetaDraft,
): boolean {
  const saved = getModelProfile(profiles, activeProfileId);
  if (!saved) return true;
  const settingsDirty = !profileSettingsEqual(saved.settings, draft);
  if (!metaDraft) {
    return settingsDirty;
  }
  const nameDirty = saved.name !== metaDraft.name.trim();
  const descriptionDirty =
    saved.description !== metaDraft.description.trim();
  return settingsDirty || nameDirty || descriptionDirty;
}

export function upsertModelProfile(
  profiles: ModelProfile[],
  profile: ModelProfile,
): ModelProfile[] {
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx < 0) return [...profiles, profile];
  const next = [...profiles];
  next[idx] = profile;
  return next;
}

export function createModelProfile(
  profiles: ModelProfile[],
  name: string,
  settings: ModelProfileSettings,
  description = "",
  projectId?: string | null,
): { profiles: ModelProfile[]; profile: ModelProfile } {
  const profile: ModelProfile = {
    id: newId(),
    name: name.trim() || "Profile",
    description: description.trim(),
    projectId: projectId ?? null,
    settings: normalizeProfileSettings(settings),
    updatedAt: Date.now(),
  };
  return { profiles: [...profiles, profile], profile };
}

/** Profiles visible for the active project (legacy rows without projectId stay global). */
export function profilesForProject(
  profiles: ModelProfile[],
  projectId: string | null | undefined,
): ModelProfile[] {
  if (!projectId) {
    return profiles.filter((p) => p.projectId == null || p.projectId === "");
  }
  return profiles.filter(
    (p) => p.projectId == null || p.projectId === "" || p.projectId === projectId,
  );
}

export function deleteModelProfile(
  profiles: ModelProfile[],
  id: string,
): ModelProfile[] {
  return profiles.filter((p) => p.id !== id);
}

/** @deprecated Legacy built-in profile removed; kept for migration only. */
export function isDefaultModelProfile(id: string): boolean {
  return id === DEFAULT_MODEL_PROFILE_ID;
}

export function renameModelProfile(
  profiles: ModelProfile[],
  id: string,
  name: string,
): ModelProfile[] {
  return updateModelProfileMeta(profiles, id, { name });
}

export function updateModelProfileMeta(
  profiles: ModelProfile[],
  id: string,
  meta: Partial<ModelProfileMetaDraft>,
): ModelProfile[] {
  const current = getModelProfile(profiles, id);
  if (!current) return profiles;
  const name =
    meta.name !== undefined
      ? meta.name.trim() || current.name
      : current.name;
  const description =
    meta.description !== undefined
      ? meta.description.trim()
      : current.description;
  return profiles.map((p) =>
    p.id === id
      ? { ...p, name, description, updatedAt: Date.now() }
      : p,
  );
}

export function formatProfileOptionSubtitle(
  settings: ModelProfileSettings,
): string {
  const ch = Math.max(1, Math.floor(settings.channel) || 1);
  return `${settings.model} · ${settings.threshold.toFixed(2)} · ch${ch}`;
}
