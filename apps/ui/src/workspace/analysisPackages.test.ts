import { beforeEach, describe, expect, it } from "vitest";
import {
  createAnalysisPackage,
  packageFileNeedsOverwrite,
  packageFilesToAnalyze,
  packageRunBreakdown,
  packagesForProject,
  resolveActivePackageForProject,
  resolvePackageFileNames,
} from "./analysisPackages";
import { DEFAULT_PREDICT_SETTINGS } from "./predictSettings";
import { settingsFromPredictSettings } from "./predictModelProfiles";
import { saveWorkspace } from "./storage";
import type { PredictQueue } from "./predictQueue";

describe("analysisPackages", () => {
  beforeEach(() => {
    localStorage.clear();
    saveWorkspace({ analysisPackages: null, activeAnalysisPackageId: null });
  });

  it("scopes packages to project", () => {
    const { packages: one, pkg } = createAnalysisPackage([], {
      name: "A",
      projectId: "p1",
      fileNames: ["a.wav"],
      settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    });
    const { packages: all, pkg: other } = createAnalysisPackage(one, {
      name: "B",
      projectId: "p2",
      fileNames: ["b.wav"],
      settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    });
    expect(packagesForProject(all, "p1")).toHaveLength(1);
    expect(packagesForProject(all, "p1")[0]!.id).toBe(pkg.id);
    expect(packagesForProject(all, "p2")[0]!.id).toBe(other.id);
  });

  it("packageFilesToAnalyze includes all non-running package wavs", () => {
    const queue: PredictQueue = {
      projectId: "p1",
      projectDir: "/proj",
      files: [
        {
          name: "a.wav",
          path: "/proj/a.wav",
          kind: "wav",
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "done",
        },
        {
          name: "b.wav",
          path: "/proj/b.wav",
          kind: "wav",
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "pending",
        },
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: true,
    };
    expect(packageFilesToAnalyze(queue, ["a.wav", "b.wav"]).map((f) => f.name)).toEqual([
      "a.wav",
      "b.wav",
    ]);
  });

  it("packageFileNeedsOverwrite covers done, filtered, failed, and labelPath", () => {
    const base = {
      kind: "wav" as const,
      bit_depth: 16,
      sample_rate_hz: 48_000,
      duration_sec: 1,
      path: "/proj/x.wav",
      name: "x.wav",
    };
    expect(packageFileNeedsOverwrite({ ...base, status: "done" })).toBe(true);
    expect(packageFileNeedsOverwrite({ ...base, status: "filtered" })).toBe(true);
    expect(packageFileNeedsOverwrite({ ...base, status: "failed" })).toBe(false);
    expect(
      packageFileNeedsOverwrite({
        ...base,
        status: "pending",
        labelPath: "/proj/labels.txt",
      }),
    ).toBe(true);
    expect(packageFileNeedsOverwrite({ ...base, status: "pending" })).toBe(false);
  });

  it("packageRunBreakdown splits fresh and re-run files", () => {
    const queue: PredictQueue = {
      projectId: "p1",
      projectDir: "/proj",
      files: [
        {
          name: "a.wav",
          path: "/proj/a.wav",
          kind: "wav",
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "done",
        },
        {
          name: "b.wav",
          path: "/proj/b.wav",
          kind: "wav",
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "pending",
        },
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: true,
    };
    expect(packageRunBreakdown(queue, ["a.wav", "b.wav"])).toEqual({
      runnable: 2,
      rerun: 1,
      fresh: 1,
    });
  });

  it("resolveActivePackageForProject returns only explicit selection", () => {
    const { packages, pkg } = createAnalysisPackage([], {
      name: "A",
      projectId: "p1",
      fileNames: ["a.wav"],
      settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
    });
    expect(resolveActivePackageForProject(packages, "p1", null)).toBeUndefined();
    expect(resolveActivePackageForProject(packages, "p1", pkg.id)?.id).toBe(pkg.id);
    expect(resolveActivePackageForProject(packages, "p1", "missing")).toBeUndefined();
  });

  it("resolvePackageFileNames drops missing wavs", () => {
    const queue: PredictQueue = {
      projectId: "p1",
      projectDir: "/proj",
      files: [
        {
          name: "a.wav",
          path: "/proj/a.wav",
          kind: "wav",
          bit_depth: null,
          sample_rate_hz: null,
          duration_sec: null,
          status: "pending",
        },
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav"],
    };
    expect(
      resolvePackageFileNames(queue, {
        id: "x",
        name: "P",
        projectId: "p1",
        fileNames: ["a.wav", "gone.wav"],
        settings: settingsFromPredictSettings(DEFAULT_PREDICT_SETTINGS),
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toEqual(["a.wav"]);
  });
});
