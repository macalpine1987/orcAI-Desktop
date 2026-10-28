import { beforeEach, describe, expect, it } from "vitest";
import {
  createModelProfile,
  DEFAULT_MODEL_PROFILE_ID,
  deleteModelProfile,
  draftSettingsForActiveProfile,
  getModelProfile,
  isProfileDirty,
  renameModelProfile,
  loadActiveModelProfileId,
  loadModelProfiles,
  normalizeProfileSettings,
  persistModelProfiles,
  profileSettingsEqual,
  profileSettingsToPredictSettings,
  profileWithSavedSettings,
  profilesForProject,
  settingsFromPredictSettings,
  type ModelProfile,
} from "./predictModelProfiles";
import {
  DEFAULT_PREDICT_SETTINGS,
  savePredictSettings,
  type PredictSettings,
} from "./predictSettings";
import { loadWorkspace, saveWorkspace } from "./storage";

describe("predictModelProfiles", () => {
  beforeEach(() => {
    localStorage.clear();
    saveWorkspace({
      predictModelProfiles: null,
      activePredictProfileId: null,
      predictSettings: null,
    });
  });

  it("starts with no profiles when storage is empty", () => {
    savePredictSettings({ ...DEFAULT_PREDICT_SETTINGS, threshold: 0.42 });
    const profiles = loadModelProfiles();
    expect(profiles).toHaveLength(0);
    expect(loadActiveModelProfileId()).toBeNull();
  });

  it("filters legacy default profile from stored list", () => {
    saveWorkspace({
      predictModelProfiles: [
        {
          id: DEFAULT_MODEL_PROFILE_ID,
          name: "default",
          description: "",
          settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
          updatedAt: Date.now(),
        },
        {
          id: "custom-1",
          name: "Field",
          description: "",
          settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
          updatedAt: Date.now(),
        },
      ],
      activePredictProfileId: DEFAULT_MODEL_PROFILE_ID,
    });
    const profiles = loadModelProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.id).toBe("custom-1");
    expect(loadActiveModelProfileId()).toBe("custom-1");
  });

  it("detects dirty draft vs saved profile", () => {
    const { profiles, profile } = createModelProfile(
      [],
      "Field",
      settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    );
    const base = profile.settings;
    expect(isProfileDirty(profiles, profile.id, base)).toBe(false);
    expect(
      isProfileDirty(profiles, profile.id, {
        ...base,
        threshold: base.threshold + 0.01,
      }),
    ).toBe(true);
  });

  it("persists profiles and active id", () => {
    const { profiles, profile } = createModelProfile(
      loadModelProfiles(),
      "Field",
      settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    );
    persistModelProfiles(profiles, profile.id);
    const ws = loadWorkspace();
    expect(ws.predictModelProfiles).toHaveLength(1);
    expect(ws.activePredictProfileId).toBe(profile.id);
    expect(loadActiveModelProfileId()).toBe(profile.id);
  });

  it("deletes profiles including the last one", () => {
    const { profiles, profile } = createModelProfile(
      [],
      "Only",
      settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    );
    const next = deleteModelProfile(profiles, profile.id);
    expect(next).toHaveLength(0);
  });

  it("renames custom profiles", () => {
    const { profiles: withExtra, profile: extra } = createModelProfile(
      [],
      "Field",
      settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    );
    const renamed = renameModelProfile(withExtra, extra.id, "Renamed");
    expect(getModelProfile(renamed, extra.id)?.name).toBe("Renamed");
  });

  it("detects dirty description in meta draft", () => {
    const { profiles: withExtra, profile: extra } = createModelProfile(
      [],
      "Field",
      settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
      "Notes",
    );
    const base = getModelProfile(withExtra, extra.id)!.settings;
    expect(
      isProfileDirty(withExtra, extra.id, base, {
        name: extra.name,
        description: "Notes",
      }),
    ).toBe(false);
    expect(
      isProfileDirty(withExtra, extra.id, base, {
        name: extra.name,
        description: "Changed",
      }),
    ).toBe(true);
  });

  it("compares profile settings field-by-field", () => {
    const a = settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS);
    const b = { ...a };
    expect(profileSettingsEqual(a, b)).toBe(true);
    expect(profileSettingsEqual(a, { ...b, labelSuffix: "x" })).toBe(false);
  });

  it("drops a missing model directory and keeps the draft session fields", () => {
    const base: PredictSettings = {
      ...DEFAULT_PREDICT_SETTINGS,
      model: "trained-1",
      modelDir: "/models/trained-1",
      additionalOpen: true,
      callDurationLimitsProjectDir: "/proj",
    };
    const preset = settingsFromPredictSettings({
      ...DEFAULT_PREDICT_SETTINGS,
      model: "orcai-isl-v1",
      modelDir: "  ",
    });
    expect(preset.modelDir).toBeUndefined();
    expect("modelDir" in preset).toBe(false);
    expect(normalizeProfileSettings({ ...preset, modelDir: "" }).modelDir).toBeUndefined();
    const next = profileSettingsToPredictSettings(preset, base);
    expect(next.model).toBe("orcai-isl-v1");
    expect(next.modelDir).toBeUndefined();
    expect(next.additionalOpen).toBe(true);
    expect(next.callDurationLimitsProjectDir).toBe("/proj");
  });

  it("keeps a trained model directory stored on the preset", () => {
    const preset = settingsFromPredictSettings({
      ...DEFAULT_PREDICT_SETTINGS,
      model: "trained-1",
      modelDir: "/models/trained-1",
    });
    const next = profileSettingsToPredictSettings(preset, {
      ...DEFAULT_PREDICT_SETTINGS,
      modelDir: "/models/other",
    });
    expect(next.model).toBe("trained-1");
    expect(next.modelDir).toBe("/models/trained-1");
  });

  it("draftSettingsForActiveProfile uses the preset, not the last predict settings", () => {
    const { profiles, profile } = createModelProfile(
      [],
      "Field",
      settingsFromPredictSettings({
        ...DEFAULT_PREDICT_SETTINGS,
        model: "orcai-nor-v1",
        threshold: 0.2,
      }),
    );
    persistModelProfiles(profiles, profile.id);
    savePredictSettings({
      ...DEFAULT_PREDICT_SETTINGS,
      model: "orcai-isl-v1",
      threshold: 0.9,
      modelDir: "/models/trained",
    });
    const draft = draftSettingsForActiveProfile();
    expect(draft.model).toBe("orcai-nor-v1");
    expect(draft.threshold).toBe(0.2);
    expect(draft.modelDir).toBeUndefined();
  });

  it("draftSettingsForActiveProfile keeps a model passed from navigation", () => {
    const { profiles, profile } = createModelProfile(
      [],
      "Field",
      settingsFromPredictSettings({
        ...DEFAULT_PREDICT_SETTINGS,
        model: "orcai-nor-v1",
        threshold: 0.2,
      }),
    );
    persistModelProfiles(profiles, profile.id);
    savePredictSettings({
      ...DEFAULT_PREDICT_SETTINGS,
      model: "orcai-isl-v1",
      threshold: 0.9,
    });
    const draft = draftSettingsForActiveProfile({ model: "from-nav" });
    expect(draft.model).toBe("from-nav");
    expect(draft.threshold).toBe(0.2);
  });

  it("saving settings leaves a shared preset shared and a project preset on its project", () => {
    const settings = settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS);
    const { profile: shared } = createModelProfile([], "Shared", settings, "", null);
    const saved = profileWithSavedSettings(shared, {
      ...shared.settings,
      threshold: 0.33,
    });
    expect(saved.projectId).toBeNull();
    expect(saved.settings.threshold).toBe(0.33);
    expect(profilesForProject([saved], "project-b").map((p) => p.id)).toEqual([
      shared.id,
    ]);

    const bound: ModelProfile = {
      ...shared,
      id: "bound",
      projectId: "project-a",
    };
    const savedBound = profileWithSavedSettings(bound, {
      ...bound.settings,
      threshold: 0.4,
    });
    expect(savedBound.projectId).toBe("project-a");
    expect(profilesForProject([savedBound], "project-b")).toHaveLength(0);
    expect(profilesForProject([savedBound], "project-a")).toHaveLength(1);
  });
});
