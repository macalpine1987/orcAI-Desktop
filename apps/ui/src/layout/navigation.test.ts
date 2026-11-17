import { describe, expect, it } from "vitest";
import {
  hasActiveProject,
  isProjectRequiredPath,
  pipelineNavInactive,
  pipelineNavInactiveForWorkspace,
  predictNavInactive,
  predictNavInactiveForWorkspace,
  projectRequiredNavInactive,
  type NavItemId,
  type ShellFocusInput,
} from "./navigation";

function workspace(
  patch: Partial<ShellFocusInput>,
): ShellFocusInput {
  return {
    activeProjectId: "p1",
    projectDir: "/tmp/demo",
    activeProjectFocus: null,
    activeProjectKind: "recognition",
    ...patch,
  };
}

describe("pipelineNavInactive", () => {
  it("keeps Training inactive only for recognition focus", () => {
    expect(pipelineNavInactive("recognition")).toBe(true);
    expect(pipelineNavInactive("training")).toBe(false);
    expect(pipelineNavInactive("full")).toBe(false);
    expect(pipelineNavInactive(null)).toBe(false);
    expect(pipelineNavInactive(undefined)).toBe(false);
  });

  it("treats a project without stored focus as recognition unless kind is training", () => {
    expect(pipelineNavInactiveForWorkspace(workspace({}))).toBe(true);
    expect(
      pipelineNavInactiveForWorkspace(
        workspace({ activeProjectKind: "training" }),
      ),
    ).toBe(false);
    expect(
      pipelineNavInactiveForWorkspace(
        workspace({ activeProjectFocus: "full", activeProjectKind: "recognition" }),
      ),
    ).toBe(false);
    expect(
      pipelineNavInactiveForWorkspace(
        workspace({
          activeProjectId: null,
          projectDir: null,
          activeProjectFocus: null,
          activeProjectKind: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("predictNavInactive", () => {
  it("keeps Predictions inactive only for training focus", () => {
    expect(predictNavInactive("training")).toBe(true);
    expect(predictNavInactive("recognition")).toBe(false);
    expect(predictNavInactive("full")).toBe(false);
    expect(predictNavInactive(null)).toBe(false);
    expect(predictNavInactive(undefined)).toBe(false);
  });

  it("treats a project without stored focus as recognition unless kind is training", () => {
    expect(predictNavInactiveForWorkspace(workspace({}))).toBe(false);
    expect(
      predictNavInactiveForWorkspace(
        workspace({ activeProjectKind: "training" }),
      ),
    ).toBe(true);
    expect(
      predictNavInactiveForWorkspace(
        workspace({ activeProjectFocus: "training", activeProjectKind: "recognition" }),
      ),
    ).toBe(true);
    expect(
      predictNavInactiveForWorkspace(
        workspace({ activeProjectFocus: "full", activeProjectKind: "training" }),
      ),
    ).toBe(false);
    expect(
      predictNavInactiveForWorkspace(
        workspace({
          activeProjectId: null,
          projectDir: null,
          activeProjectFocus: null,
          activeProjectKind: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("project required sections", () => {
  const blocked: NavItemId[] = [
    "predict",
    "pipeline",
    "models",
    "results",
    "jobs",
  ];
  const open: NavItemId[] = ["home", "projects", "settings", "help"];
  const none = {
    activeProjectId: null,
    projectDir: null,
  };

  it("treats a missing id or folder as no active project", () => {
    expect(hasActiveProject(none)).toBe(false);
    expect(hasActiveProject({ activeProjectId: "p1", projectDir: null })).toBe(
      false,
    );
    expect(hasActiveProject({ activeProjectId: null, projectDir: "/tmp/demo" })).toBe(
      false,
    );
    expect(hasActiveProject({ activeProjectId: "p1", projectDir: "/tmp/demo" })).toBe(
      true,
    );
  });

  it("blocks recognition, training, models, results, and tasks without a project", () => {
    for (const id of blocked) {
      expect(projectRequiredNavInactive(id, none)).toBe(true);
    }
    for (const id of open) {
      expect(projectRequiredNavInactive(id, none)).toBe(false);
    }
    for (const id of blocked) {
      expect(projectRequiredNavInactive(id, workspace({}))).toBe(false);
    }
  });

  it("matches the routes of those sections", () => {
    expect(isProjectRequiredPath("/predict")).toBe(true);
    expect(isProjectRequiredPath("/pipeline/")).toBe(true);
    expect(isProjectRequiredPath("/models")).toBe(true);
    expect(isProjectRequiredPath("/results")).toBe(true);
    expect(isProjectRequiredPath("/jobs")).toBe(true);
    expect(isProjectRequiredPath("/projects")).toBe(false);
    expect(isProjectRequiredPath("/")).toBe(false);
    expect(isProjectRequiredPath("/settings")).toBe(false);
    expect(isProjectRequiredPath("/help")).toBe(false);
    expect(isProjectRequiredPath("/spectrogram")).toBe(false);
  });
});
