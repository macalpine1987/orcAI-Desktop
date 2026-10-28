import { describe, expect, it } from "vitest";
import { filterWavPaths, isWavPath, pathsFromFileList, pointInClientRect } from "./wavDrop";

describe("wavDrop", () => {
  it("filters to unique wav paths sorted by filename", () => {
    expect(filterWavPaths(["/a/one.wav", "/a/two.WAV", "/a/skip.txt", "/a/one.wav", "  "])).toEqual([
      "/a/one.wav",
      "/a/two.WAV",
    ]);
    expect(filterWavPaths(["/z/c.wav", "/z/a.wav", "/z/B.wav"])).toEqual([
      "/z/a.wav",
      "/z/B.wav",
      "/z/c.wav",
    ]);
    expect(isWavPath("clip.wav")).toBe(true);
    expect(isWavPath("clip.mp3")).toBe(false);
  });

  it("reads File.path from a drop FileList", () => {
    const files = [
      { name: "a.wav", path: "/tmp/a.wav" },
      { name: "b.txt", path: "/tmp/b.txt" },
      { name: "c.wav" },
    ] as unknown as File[];
    expect(pathsFromFileList(files)).toEqual(["/tmp/a.wav"]);
  });

  it("hit-tests drop position against a client rect", () => {
    const rect = { left: 10, right: 110, top: 20, bottom: 80 } as DOMRect;
    expect(pointInClientRect(50, 40, rect)).toBe(true);
    expect(pointInClientRect(5, 40, rect)).toBe(false);
    expect(pointInClientRect(50, 40, null)).toBe(false);
  });
});
