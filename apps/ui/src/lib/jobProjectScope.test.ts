import { describe, expect, it } from "vitest";
import { jobMatchesProjectDir } from "./jobProjectScope";

describe("jobMatchesProjectDir", () => {
  it("keeps only the active project folder", () => {
    expect(jobMatchesProjectDir({ project_dir: "/proj/a" }, "/proj/a")).toBe(true);
    expect(jobMatchesProjectDir({ project_dir: "/proj/a/" }, "/proj/a")).toBe(true);
    expect(jobMatchesProjectDir({ project_dir: "C:\\proj\\a\\" }, "C:/proj/a")).toBe(true);
    expect(jobMatchesProjectDir({ project_dir: "/proj/b" }, "/proj/a")).toBe(false);
    expect(jobMatchesProjectDir({}, "/proj/a")).toBe(false);
    expect(jobMatchesProjectDir({ project_dir: "/proj/a" }, null)).toBe(false);
  });
});
