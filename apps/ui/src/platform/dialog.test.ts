import { describe, expect, it } from "vitest";
import { basename, isAbsolutePath } from "./dialog";

describe("isAbsolutePath", () => {
  it("detects unix paths", () => {
    expect(isAbsolutePath("/Users/x/a.wav")).toBe(true);
  });

  it("detects windows paths", () => {
    expect(isAbsolutePath("C:\\data\\a.wav")).toBe(true);
    expect(isAbsolutePath("D:/data/a.wav")).toBe(true);
  });

  it("rejects bare filenames", () => {
    expect(isAbsolutePath("recording.wav")).toBe(false);
  });
});

describe("basename", () => {
  it("returns last segment", () => {
    expect(basename("/a/b/c.wav")).toBe("c.wav");
    expect(basename("C:\\a\\b.wav")).toBe("b.wav");
  });
});
