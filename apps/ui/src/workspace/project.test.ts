import { describe, expect, it, beforeEach } from "vitest";
import type { ProjectRecord } from "../api/projects";
import {
  applyActiveProject,
  clearActiveProjectIf,
  defaultRecordingTablePath,
  defaultRecordingsDir,
  reconcileWorkspaceWithProjects,
} from "./project";
import { loadWorkspace, saveWorkspace } from "./storage";
import { loadPredictSettings, savePredictSettings } from "./predictSettings";

const sampleProject: ProjectRecord = {
  id: "p1",
  path: "/tmp/study",
  display_name: "Study",
  description: "Test",
  orcai_name: "study",
  project_kind: "recognition",
  created_at: 1,
  updated_at: 2,
  recording_table_path: "/tmp/study/recording_table.csv",
  recordings_dir: "/tmp/study/recordings",
  wav_count: 0,
  initialized: false,
};

describe("project workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("derives default paths", () => {
    expect(defaultRecordingTablePath("/data/proj/")).toBe(
      "/data/proj/recording_table.csv",
    );
    expect(defaultRecordingsDir("/data/proj")).toBe("/data/proj/recordings");
  });

  it("applyActiveProject updates workspace", () => {
    applyActiveProject(sampleProject);
    const ws = loadWorkspace();
    expect(ws.activeProjectId).toBe("p1");
    expect(ws.projectDir).toBe("/tmp/study");
    expect(ws.projectName).toBe("Study");
    expect(ws.recordingTablePath).toBe("/tmp/study/recording_table.csv");
  });

  it("applyActiveProject stores project kind", () => {
    applyActiveProject({ ...sampleProject, project_kind: "training" });
    expect(loadWorkspace().activeProjectKind).toBe("training");
  });

  it("applyActiveProject stores soft focus (and kind fallback)", () => {
    applyActiveProject({ ...sampleProject, focus: "full" });
    expect(loadWorkspace().activeProjectFocus).toBe("full");
    applyActiveProject({ ...sampleProject, project_kind: "training", focus: null });
    expect(loadWorkspace().activeProjectFocus).toBe("training");
    applyActiveProject(sampleProject);
    expect(loadWorkspace().activeProjectFocus).toBe("recognition");
  });

  it("applyActiveProject clears table path when project has none", () => {
    applyActiveProject({ ...sampleProject, recording_table_path: null });
    expect(loadWorkspace().recordingTablePath).toBeNull();
  });

  it("applyActiveProject loads per-project predict model", () => {
    savePredictSettings({ model: "orcai-isl-v1", modelDir: undefined });
    applyActiveProject({
      ...sampleProject,
      predict_model: "orcai-nor-v1",
      predict_model_dir: null,
    });
    expect(loadPredictSettings().model).toBe("orcai-nor-v1");
    expect(loadPredictSettings().modelDir).toBeUndefined();
  });

  it("applyActiveProject resets to default when project has no model", () => {
    savePredictSettings({
      model: "trained-x",
      modelDir: "/tmp/models/x",
    });
    applyActiveProject(sampleProject);
    expect(loadPredictSettings().model).toBe("orcai-isl-v1");
    expect(loadPredictSettings().modelDir).toBeUndefined();
  });

  it("applyActiveProject persists default builtin when workspace had no predictSettings", () => {
    // Simulate never-saved predict settings (DEFAULT only via loadPredictSettings).
    expect(loadWorkspace().predictSettings).toBeNull();
    applyActiveProject(sampleProject);
    expect(loadWorkspace().predictSettings?.model).toBe("orcai-isl-v1");
    expect(loadPredictSettings().model).toBe("orcai-isl-v1");
  });

  it("clearActiveProjectIf only clears matching id", () => {
    applyActiveProject(sampleProject);
    clearActiveProjectIf("other");
    expect(loadWorkspace().activeProjectId).toBe("p1");
    clearActiveProjectIf("p1");
    expect(loadWorkspace().activeProjectId).toBeNull();
  });

  it("clearActiveProjectIf does not publish notice by default", () => {
    applyActiveProject(sampleProject);
    const cleared = clearActiveProjectIf("p1");
    expect(cleared?.path).toBe("/tmp/study");
    expect(loadWorkspace().activeProjectId).toBeNull();
  });

  it("migrates workspace without activeProjectId", () => {
    saveWorkspace({
      projectDir: "/legacy",
      projectName: "legacy",
      recordingTablePath: "/legacy/recording_table.csv",
    });
    const ws = loadWorkspace();
    expect(ws.activeProjectId).toBeNull();
    expect(ws.projectDir).toBe("/legacy");
  });

  it("reconcileWorkspaceWithProjects clears stale active project", () => {
    applyActiveProject(sampleProject);
    const cleared = reconcileWorkspaceWithProjects([]);
    expect(cleared).toEqual({
      path: "/tmp/study",
      name: "Study",
    });
    const ws = loadWorkspace();
    expect(ws.activeProjectId).toBeNull();
    expect(ws.projectDir).toBeNull();
  });

  it("clearActiveProjectIf returns path for notice", () => {
    applyActiveProject(sampleProject);
    const cleared = clearActiveProjectIf("p1");
    expect(cleared?.path).toBe("/tmp/study");
    expect(loadWorkspace().activeProjectId).toBeNull();
  });
});
