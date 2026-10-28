import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNOTATIONS_REL,
  DEFAULT_EQUIVALENCES_REL,
  DEFAULT_RECORDING_TABLE_REL,
  isOutsideProjectPath,
  projectWizardDataPaths,
  sanitizeWizardDataPaths,
  wizardPathAbsolute,
} from "../trainWizard/defaults";

describe("sanitizeWizardDataPaths", () => {
  const root = "/Users/me/projects/demo";

  it("keeps in-project relative defaults", () => {
    expect(
      sanitizeWizardDataPaths(
        {
          recordingTableRel: "recording_table.csv",
          annotationsRel: "annotations/",
          equivalencesRel: "call_equivalences.json",
        },
        root,
      ),
    ).toEqual({
      recordingTableRel: DEFAULT_RECORDING_TABLE_REL,
      annotationsRel: DEFAULT_ANNOTATIONS_REL,
      equivalencesRel: DEFAULT_EQUIVALENCES_REL,
    });
  });

  it("converts absolute paths under the project to relative", () => {
    expect(
      sanitizeWizardDataPaths(
        {
          recordingTableRel: `${root}/recording_table.csv`,
          annotationsRel: `${root}/annotations`,
          equivalencesRel: `${root}/call_equivalences.json`,
        },
        root,
      ),
    ).toEqual({
      recordingTableRel: "recording_table.csv",
      annotationsRel: "annotations/",
      equivalencesRel: "call_equivalences.json",
    });
  });

  it("rejects annotation import source outside the project", () => {
    const source = "/Users/me/Downloads/orcAI-labels";
    expect(
      sanitizeWizardDataPaths(
        {
          recordingTableRel: `${source}/recording_table.csv`,
          annotationsRel: `${source}/`,
          equivalencesRel: `${source}/call_equivalences.json`,
        },
        root,
      ),
    ).toEqual({
      recordingTableRel: DEFAULT_RECORDING_TABLE_REL,
      annotationsRel: DEFAULT_ANNOTATIONS_REL,
      equivalencesRel: DEFAULT_EQUIVALENCES_REL,
    });
  });

  it("projectWizardDataPaths always returns in-project layout", () => {
    expect(projectWizardDataPaths(root)).toEqual({
      recordingTableRel: "recording_table.csv",
      annotationsRel: "annotations/",
      equivalencesRel: "call_equivalences.json",
    });
  });

  it("wizardPathAbsolute shows paths under the project folder", () => {
    expect(wizardPathAbsolute(root, "annotations/")).toBe(`${root}/annotations/`);
    expect(wizardPathAbsolute(root, "recording_table.csv")).toBe(
      `${root}/recording_table.csv`,
    );
    // Browse dialog defaultPath uses the same absolute (strip trailing slash).
    expect(wizardPathAbsolute(root, "annotations/").replace(/\/+$/, "")).toBe(
      `${root}/annotations`,
    );
  });

  it("isOutsideProjectPath detects foreign absolutes", () => {
    expect(isOutsideProjectPath("/tmp/other/annotations", root)).toBe(true);
    expect(isOutsideProjectPath(`${root}/annotations`, root)).toBe(false);
    expect(isOutsideProjectPath("annotations/", root)).toBe(false);
    expect(isOutsideProjectPath("../escape", root)).toBe(true);
  });
});
