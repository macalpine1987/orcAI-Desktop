import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  getModelProfile,
  isProfileDirty,
  persistModelProfiles,
  profileSettingsToPredictSettings,
  profileWithSavedSettings,
  profilesForProject,
  settingsFromPredictSettings,
  upsertModelProfile,
  type ModelProfile,
  type ModelProfileSettings,
} from "../workspace/predictModelProfiles";
import type { PredictSettings } from "../workspace/predictSettings";

function samePresetModel(
  draft: PredictSettings,
  preset: ModelProfileSettings,
): boolean {
  const draftDir = draft.modelDir?.trim() || undefined;
  const presetDir = preset.modelDir?.trim() || undefined;
  return draft.model === preset.model && draftDir === presetDir;
}

type Options = {
  profiles: ModelProfile[];
  setProfiles: Dispatch<SetStateAction<ModelProfile[]>>;
  activeProfileId: string | null;
  setActiveProfileId: Dispatch<SetStateAction<string | null>>;
  draftSettings: PredictSettings;
  draftSettingsRef: MutableRefObject<PredictSettings>;
  profilesRef: MutableRefObject<ModelProfile[]>;
  activeProfileIdRef: MutableRefObject<string | null>;
  presetModelGuardRef: MutableRefObject<boolean>;
  workspaceActiveProjectId: string | null | undefined;
  setSaveAsOpen: (open: boolean) => void;
  applyDraftChange: (next: PredictSettings, prev: PredictSettings) => void;
};

export function usePredictSettingsProfiles({
  profiles,
  setProfiles,
  activeProfileId,
  setActiveProfileId,
  draftSettings,
  draftSettingsRef,
  profilesRef,
  activeProfileIdRef,
  presetModelGuardRef,
  workspaceActiveProjectId,
  setSaveAsOpen,
  applyDraftChange,
}: Options) {
  const projectProfiles = useMemo(
    () => profilesForProject(profiles, workspaceActiveProjectId),
    [profiles, workspaceActiveProjectId],
  );
  const presetDirty = useMemo(() => {
    if (!activeProfileId) return false;
    return isProfileDirty(
      profiles,
      activeProfileId,
      settingsFromPredictSettings(draftSettings),
    );
  }, [profiles, activeProfileId, draftSettings]);

  const savePreset = () => {
    if (
      activeProfileId &&
      projectProfiles.some((p) => p.id === activeProfileId)
    ) {
      const current = getModelProfile(profiles, activeProfileId);
      if (!current) {
        setSaveAsOpen(true);
        return;
      }
      const nextProfiles = upsertModelProfile(
        profiles,
        profileWithSavedSettings(
          current,
          settingsFromPredictSettings(draftSettings),
        ),
      );
      profilesRef.current = nextProfiles;
      setProfiles(nextProfiles);
      persistModelProfiles(nextProfiles, activeProfileId);
      return;
    }
    setSaveAsOpen(true);
  };

  const onSelectPreset = (id: string) => {
    const profile = getModelProfile(profiles, id);
    if (!profile) return;
    const prev = draftSettingsRef.current;
    const next = profileSettingsToPredictSettings(profile.settings, prev);
    activeProfileIdRef.current = id;
    profilesRef.current = profiles;
    draftSettingsRef.current = next;
    presetModelGuardRef.current = true;
    setActiveProfileId(id);
    persistModelProfiles(profiles, id);
    applyDraftChange(next, prev);
  };

  return {
    projectProfiles,
    presetDirty,
    savePreset,
    onSelectPreset,
    samePresetModel,
  };
}

export { samePresetModel };
