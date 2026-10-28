import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_PREDICT_SETTINGS,
  applyProjectCallDurationLimits,
  buildPredictJobParams,
  loadPredictSettings,
  savePredictSettings,
} from "./predictSettings";
import { saveWorkspace } from "./storage";

describe("predictSettings · workspace model sync", () => {
  beforeEach(() => {
    localStorage.clear();
    saveWorkspace({
      predictSettings: { ...DEFAULT_PREDICT_SETTINGS, model: "orcai-isl-v1" },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("savePredictSettings updates model and modelDir", () => {
    savePredictSettings({
      model: "trained-1",
      modelDir: "/tmp/models/trained-1",
    });
    expect(loadPredictSettings().model).toBe("trained-1");
    expect(loadPredictSettings().modelDir).toBe("/tmp/models/trained-1");
  });

  it("clears modelDir when switching to builtin", () => {
    savePredictSettings({
      model: "trained-1",
      modelDir: "/tmp/models/trained-1",
    });
    savePredictSettings({
      model: "orcai-nor-v1",
      modelDir: undefined,
    });
    const s = loadPredictSettings();
    expect(s.model).toBe("orcai-nor-v1");
    expect(s.modelDir).toBeUndefined();
  });

  it("does not restore a leftover duration JSON as an enabled filter", () => {
    saveWorkspace({
      predictSettings: {
        ...DEFAULT_PREDICT_SETTINGS,
        callDurationLimits: "/p/p_call_duration_limits.json",
      },
    });
    const s = loadPredictSettings();
    expect(s.callDurationFilter).toBe(false);
    expect(s.callDurationLimits).toBe("");
  });
});

describe("predictSettings · CSV base_dir_recording", () => {
  it("does not pass base_dir_recording for CSV batch jobs", () => {
    const body = buildPredictJobParams(
      {
        ...DEFAULT_PREDICT_SETTINGS,
        baseDirRecording: "/Users/x/Desktop/12/не/recordings",
      },
      "/proj/recording_table.csv",
      "/proj",
      "orcai-isl-v1",
      [{ id: "orcai-isl-v1", name: "orcai-isl-v1", path: "", builtin: true }],
      undefined,
      { recordingNames: ["a"] },
    );
    expect(body.base_dir_recording).toBeUndefined();
    expect(body.recording_names).toEqual(["a"]);
  });

  it("still passes base_dir_recording for single WAV jobs", () => {
    const body = buildPredictJobParams(
      {
        ...DEFAULT_PREDICT_SETTINGS,
        baseDirRecording: "/proj/recordings",
      },
      "/proj/recordings/a.wav",
      "/proj",
      "orcai-isl-v1",
      [{ id: "orcai-isl-v1", name: "orcai-isl-v1", path: "", builtin: true }],
    );
    expect(body.base_dir_recording).toBe("/proj/recordings");
  });

  it("clears foreign baseDirRecording when project changes", () => {
    const next = applyProjectCallDurationLimits(
      {
        ...DEFAULT_PREDICT_SETTINGS,
        baseDirRecording: "/old/recordings",
        callDurationLimitsProjectDir: "/old",
      },
      "/new",
      "new",
    );
    expect(next.baseDirRecording).toBe("");
    expect(next.callDurationLimitsProjectDir).toBe("/new");
    expect(next.callDurationLimits).toBe("");
  });

  it("does not enable on-the-fly duration filter when a project is selected", () => {
    const next = applyProjectCallDurationLimits(
      { ...DEFAULT_PREDICT_SETTINGS },
      "/proj/Fjord",
      "Fjord",
    );
    expect(next.callDurationFilter).toBe(false);
    expect(next.callDurationLimits).toBe("");
    expect(next.callDurationLimitsProjectDir).toBe("/proj/Fjord");
  });

  it("does not treat a leftover JSON path as opt-in", () => {
    const next = applyProjectCallDurationLimits(
      {
        ...DEFAULT_PREDICT_SETTINGS,
        callDurationFilter: false,
        callDurationLimits: "/proj/Fjord/Fjord_call_duration_limits.json",
        callDurationLimitsProjectDir: "/old",
      },
      "/proj/Fjord",
      "Fjord",
    );
    expect(next.callDurationFilter).toBe(false);
    expect(next.callDurationLimits).toBe("");
  });

  it("retargets limits JSON when the filter is already on", () => {
    const next = applyProjectCallDurationLimits(
      {
        ...DEFAULT_PREDICT_SETTINGS,
        callDurationFilter: true,
        callDurationLimits: "/old/old_call_duration_limits.json",
        callDurationLimitsProjectDir: "/old",
      },
      "/new",
      "new",
    );
    expect(next.callDurationFilter).toBe(true);
    expect(next.callDurationLimits).toBe("/new/new_call_duration_limits.json");
    expect(next.callDurationLimitsProjectDir).toBe("/new");
  });
});
