import { describe, expect, it } from "vitest";
import { joinFsPath } from "./joinFsPath";

describe("joinFsPath · ", () => {
  it("joins POSIX segments with /", () => {
    expect(joinFsPath("/Users/me/proj", "recordings")).toBe(
      "/Users/me/proj/recordings",
    );
    expect(joinFsPath("/Users/me/proj/", "models", "a")).toBe(
      "/Users/me/proj/models/a",
    );
  });

  it("joins Windows drive paths with \\", () => {
    expect(joinFsPath("C:\\Users\\me\\proj", "recordings")).toBe(
      "C:\\Users\\me\\proj\\recordings",
    );
    expect(joinFsPath("D:/data", "tvt_data")).toBe("D:/data\\tvt_data");
  });

  it("strips redundant separators on trailing/leading parts", () => {
    expect(joinFsPath("/tmp/p/", "/spectrograms/")).toBe("/tmp/p/spectrograms");
    expect(joinFsPath("C:\\p\\", "\\models\\")).toBe("C:\\p\\models");
  });

  it("returns empty string for empty input", () => {
    expect(joinFsPath()).toBe("");
    expect(joinFsPath("", "")).toBe("");
  });

  it("builds typical project layout on POSIX", () => {
    const root = "/Users/lab/orcai-projects/ferop";
    expect(joinFsPath(root, "recording_table.csv")).toBe(
      "/Users/lab/orcai-projects/ferop/recording_table.csv",
    );
    expect(joinFsPath(root, "recordings")).toBe(
      "/Users/lab/orcai-projects/ferop/recordings",
    );
    expect(joinFsPath(root, "spectrograms")).toBe(
      "/Users/lab/orcai-projects/ferop/spectrograms",
    );
    expect(joinFsPath(root, "tvt_data")).toBe(
      "/Users/lab/orcai-projects/ferop/tvt_data",
    );
    expect(joinFsPath(root, "models")).toBe(
      "/Users/lab/orcai-projects/ferop/models",
    );
  });

  it("builds typical project layout on Windows UNC-style drive", () => {
    const root = "C:\\Users\\lab\\orcai-projects\\ferop";
    expect(joinFsPath(root, "recording_table.csv")).toBe(
      "C:\\Users\\lab\\orcai-projects\\ferop\\recording_table.csv",
    );
    expect(joinFsPath(root, "recordings", "Whale.wav")).toBe(
      "C:\\Users\\lab\\orcai-projects\\ferop\\recordings\\Whale.wav",
    );
  });

  it("ignores empty middle segments", () => {
    expect(joinFsPath("/proj", "", "models")).toBe("/proj/models");
    expect(joinFsPath("C:\\proj", "", "models")).toBe("C:\\proj\\models");
  });

  it("preserves UNC-like leading backslash roots as Windows", () => {
    expect(joinFsPath("\\\\server\\share\\proj", "recordings")).toBe(
      "\\\\server\\share\\proj\\recordings",
    );
  });

  it("does not use string '/' concatenation for multi-depth", () => {
    const deep = joinFsPath("/a", "b", "c", "d", "e.wav");
    expect(deep).toBe("/a/b/c/d/e.wav");
    expect(deep.split("/").filter(Boolean)).toEqual(["a", "b", "c", "d", "e.wav"]);
  });
});
