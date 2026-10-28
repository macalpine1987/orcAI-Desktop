import { describe, expect, it } from "vitest";
import { projectCallDurationLimitsPath } from "./predictSettings";
import {
  defaultRecordingTablePath,
  defaultRecordingsDir,
} from "./project";

describe("project path helpers · ", () => {
  it("defaultRecordingTablePath uses joinFsPath on POSIX", () => {
    expect(defaultRecordingTablePath("/tmp/proj")).toBe(
      "/tmp/proj/recording_table.csv",
    );
    expect(defaultRecordingTablePath("/tmp/proj/")).toBe(
      "/tmp/proj/recording_table.csv",
    );
  });

  it("defaultRecordingTablePath uses joinFsPath on Windows", () => {
    expect(defaultRecordingTablePath("C:\\Users\\me\\proj")).toBe(
      "C:\\Users\\me\\proj\\recording_table.csv",
    );
  });

  it("defaultRecordingsDir uses joinFsPath", () => {
    expect(defaultRecordingsDir("/data/p")).toBe("/data/p/recordings");
    expect(defaultRecordingsDir("D:\\data\\p")).toBe("D:\\data\\p\\recordings");
  });

  it("projectCallDurationLimitsPath preserves basename case", () => {
    expect(projectCallDurationLimitsPath("/tmp/Ferop", "Ferop")).toBe(
      "/tmp/Ferop/Ferop_call_duration_limits.json",
    );
    expect(projectCallDurationLimitsPath("/tmp/Ferop", "ferop")).toBe(
      "/tmp/Ferop/ferop_call_duration_limits.json",
    );
  });

  it("projectCallDurationLimitsPath falls back to dir basename (POSIX + Win)", () => {
    expect(projectCallDurationLimitsPath("/tmp/MyProject", null)).toBe(
      "/tmp/MyProject/MyProject_call_duration_limits.json",
    );
    expect(projectCallDurationLimitsPath("C:\\data\\MyProject", "")).toBe(
      "C:\\data\\MyProject\\MyProject_call_duration_limits.json",
    );
  });
});
