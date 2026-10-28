import { describe, expect, it } from "vitest";
import {
  pipelineNavInactive,
  pipelineNavInactiveForWorkspace,
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
