import { describe, expect, it } from "vitest";
import { inferWavFromLabelPath, resolveOpenFilePath } from "./openFile";

describe("inferWavFromLabelPath", () => {
  it("parses standard orcAI label names", () => {
    expect(
      inferWavFromLabelPath("/data/rec_c1_orcai-isl-v1_predicted.txt"),
    ).toBe("/data/rec.wav");
  });

  it("falls back for custom predicted suffix", () => {
    expect(inferWavFromLabelPath("/data/custom_predicted.txt")).toBe(
      "/data/custom.wav",
    );
  });

  it("falls back for filtered labels", () => {
    expect(inferWavFromLabelPath("/data/custom_filtered.txt")).toBe(
      "/data/custom.wav",
    );
  });
});

describe("resolveOpenFilePath", () => {
  it("routes recording_table.csv to projects", () => {
    const target = resolveOpenFilePath("/proj/recording_table.csv");
    expect(target?.route).toBe("/projects");
    expect(target?.state.recordingTablePath).toBe("/proj/recording_table.csv");
  });
});
