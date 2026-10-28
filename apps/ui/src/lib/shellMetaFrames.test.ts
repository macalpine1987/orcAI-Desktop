import { describe, expect, it } from "vitest";
import {
  shellMetaEngineVisible,
  shellMetaFramesVisible,
  shellMetaModelVisible,
  shellModelDisplayLabel,
} from "./shellMetaFrames";

describe("shellMetaFramesVisible", () => {
  it("shows on all main routes including home", () => {
    expect(shellMetaFramesVisible("/")).toBe(true);
    expect(shellMetaFramesVisible("/projects")).toBe(true);
    expect(shellMetaFramesVisible("/predict")).toBe(true);
    expect(shellMetaFramesVisible("/pipeline")).toBe(true);
    expect(shellMetaFramesVisible("/jobs")).toBe(true);
    expect(shellMetaFramesVisible("/settings")).toBe(true);
    expect(shellMetaFramesVisible("/models")).toBe(true);
  });
});

describe("shellMetaEngineVisible", () => {
  it("shows engine frame on every screen", () => {
    expect(shellMetaEngineVisible("/")).toBe(true);
    expect(shellMetaEngineVisible("/jobs")).toBe(true);
    expect(shellMetaEngineVisible("/predict")).toBe(true);
  });
});

describe("shellMetaModelVisible", () => {
  it("shows for recognition and full focus on non-pipeline routes", () => {
    expect(
      shellMetaModelVisible({
        pathname: "/",
        hasActiveProject: true,
        focus: "recognition",
      }),
    ).toBe(true);
    expect(
      shellMetaModelVisible({
        pathname: "/projects",
        hasActiveProject: true,
        focus: "full",
      }),
    ).toBe(true);
  });

  it("hides on /pipeline* even for full focus (predict model ≠ training)", () => {
    expect(
      shellMetaModelVisible({
        pathname: "/pipeline",
        hasActiveProject: true,
        focus: "full",
      }),
    ).toBe(false);
    expect(
      shellMetaModelVisible({
        pathname: "/pipeline/wizard",
        hasActiveProject: true,
        focus: "recognition",
      }),
    ).toBe(false);
  });

  it("hides for training focus and without project", () => {
    expect(
      shellMetaModelVisible({
        pathname: "/",
        hasActiveProject: true,
        focus: "training",
      }),
    ).toBe(false);
    expect(
      shellMetaModelVisible({
        pathname: "/models",
        hasActiveProject: false,
        focus: "recognition",
      }),
    ).toBe(false);
  });

  it("always shows on /predict* even for training or no project", () => {
    expect(
      shellMetaModelVisible({
        pathname: "/predict",
        hasActiveProject: true,
        focus: "training",
      }),
    ).toBe(true);
    expect(
      shellMetaModelVisible({
        pathname: "/predict/results",
        hasActiveProject: false,
        focus: null,
      }),
    ).toBe(true);
  });
});

describe("shellModelDisplayLabel", () => {
  it("keeps builtin ids unchanged", () => {
    expect(shellModelDisplayLabel("orcai-isl-v1")).toBe("orcai-isl-v1");
    expect(shellModelDisplayLabel("orcai-nor-v1")).toBe("orcai-nor-v1");
  });

  it("uses basename for trained absolute path ids", () => {
    expect(
      shellModelDisplayLabel("/Users/me/proj/models/fjord-v2"),
    ).toBe("fjord-v2");
    expect(shellModelDisplayLabel("C:\\proj\\models\\fjord")).toBe("fjord");
  });

  it("prefers resolved parameter name over path", () => {
    expect(
      shellModelDisplayLabel("/tmp/models/folder", "My trained model"),
    ).toBe("My trained model");
  });
});
