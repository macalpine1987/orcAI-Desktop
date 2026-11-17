import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  getModelProfile,
  profilesForProject,
  profileSettingsToPredictSettings,
  type ModelProfile,
} from "../workspace/predictModelProfiles";
import {
  loadPredictSettings,
  savePredictSettings,
  type PredictSettings,
} from "../workspace/predictSettings";
import { persistActiveProjectPredictModel } from "../workspace/project";
import { loadWorkspace, WORKSPACE_CHANGED_EVENT } from "../workspace/storage";
import { samePresetModel } from "./usePredictSettingsProfiles";

/** Persist draft model + keep draft in sync with workspace / project switches. */
export function usePredictWorkspaceModelSync({
  draftSettings,
  draftSettingsRef,
  setDraftSettings,
  profilesRef,
  activeProfileIdRef,
  presetModelGuardRef,
  seenProjectIdRef,
  workspaceActiveProjectId,
}: {
  draftSettings: PredictSettings;
  draftSettingsRef: MutableRefObject<PredictSettings>;
  setDraftSettings: Dispatch<SetStateAction<PredictSettings>>;
  profilesRef: MutableRefObject<ModelProfile[]>;
  activeProfileIdRef: MutableRefObject<string | null>;
  presetModelGuardRef: MutableRefObject<boolean>;
  seenProjectIdRef: MutableRefObject<string | null | undefined>;
  workspaceActiveProjectId: string | null | undefined;
}): void {
  // Persist default/draft model once so shell + other pages see it without re-pick.
  useEffect(() => {
    const model = draftSettings.model?.trim();
    if (!model) return;
    const stored = loadPredictSettings();
    if (
      stored.model === model &&
      (stored.modelDir ?? undefined) === (draftSettings.modelDir ?? undefined)
    ) {
      const ws = loadWorkspace();
      if (ws.predictSettings != null) return;
    }
    savePredictSettings({
      model,
      modelDir: draftSettings.modelDir,
    });
  }, [draftSettings.model, draftSettings.modelDir]);

  useEffect(() => {
    const nextId = workspaceActiveProjectId ?? null;
    if (seenProjectIdRef.current === undefined) {
      seenProjectIdRef.current = nextId;
      return;
    }
    if (seenProjectIdRef.current === nextId) return;
    seenProjectIdRef.current = nextId;
    const visible = profilesForProject(profilesRef.current, nextId);
    const selected = activeProfileIdRef.current
      ? getModelProfile(profilesRef.current, activeProfileIdRef.current)
      : undefined;
    if (selected && visible.some((profile) => profile.id === selected.id)) {
      // Presets are shared across projects; never carry -ow into a new project
      // (this effect runs after the queue.dir clear and would otherwise restore it).
      const next = {
        ...profileSettingsToPredictSettings(
          selected.settings,
          draftSettingsRef.current,
        ),
        overwrite: false,
      };
      presetModelGuardRef.current = true;
      draftSettingsRef.current = next;
      setDraftSettings(next);
      savePredictSettings(next);
      if (nextId) {
        void persistActiveProjectPredictModel(next.model, next.modelDir ?? null);
      }
      return;
    }
    presetModelGuardRef.current = false;
    const stored = loadPredictSettings();
    const next: PredictSettings = {
      ...draftSettingsRef.current,
      model: stored.model,
      modelDir: stored.modelDir?.trim() || undefined,
      overwrite: false,
    };
    draftSettingsRef.current = next;
    setDraftSettings(next);
    savePredictSettings(next);
  }, [
    workspaceActiveProjectId,
    activeProfileIdRef,
    draftSettingsRef,
    presetModelGuardRef,
    profilesRef,
    seenProjectIdRef,
    setDraftSettings,
  ]);

  useEffect(() => {
    const syncModelFromWorkspace = () => {
      const stored = loadPredictSettings();
      const draft = draftSettingsRef.current;
      const selected = activeProfileIdRef.current
        ? getModelProfile(profilesRef.current, activeProfileIdRef.current)
        : undefined;
      const presetStillVisible =
        selected != null &&
        profilesForProject(
          profilesRef.current,
          loadWorkspace().activeProjectId,
        ).some((profile) => profile.id === selected.id);
      if (
        presetModelGuardRef.current &&
        selected &&
        presetStillVisible &&
        samePresetModel(draft, selected.settings)
      ) {
        const presetDir = selected.settings.modelDir?.trim() || undefined;
        const storedDir = stored.modelDir?.trim() || undefined;
        if (stored.model !== selected.settings.model || storedDir !== presetDir) {
          void persistActiveProjectPredictModel(
            selected.settings.model,
            presetDir ?? null,
          );
        }
        return;
      }
      setDraftSettings((prev) => {
        const prevDir = prev.modelDir ?? undefined;
        const nextDir = stored.modelDir ?? undefined;
        if (prev.model === stored.model && prevDir === nextDir) return prev;
        const next = { ...prev, model: stored.model, modelDir: stored.modelDir };
        draftSettingsRef.current = next;
        return next;
      });
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncModelFromWorkspace);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncModelFromWorkspace);
    };
  }, [
    activeProfileIdRef,
    draftSettingsRef,
    presetModelGuardRef,
    profilesRef,
    setDraftSettings,
  ]);
}
