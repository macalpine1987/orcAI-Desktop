import { describe, expect, it } from "vitest";
import {
  projectFolderName,
  projectNameConflictMessage,
  slugifyProjectName,
} from "./projectName";

describe("projectNameConflictMessage", () => {
  it("includes existing project name when known", () => {
    const msg = projectNameConflictMessage(
      ((key: string, opts?: { name?: string; existing?: string }) => {
        if (key === "projects.nameTakenWithExisting" && opts) {
          return `${opts.name}/${opts.existing}`;
        }
        return key;
      }) as never,
      "New",
      [{ reason: "display_name", display_name: "Old" }],
    );
    expect(msg).toBe("New/Old");
  });

  it("suggests register for orphan project directories", () => {
    const msg = projectNameConflictMessage(
      ((key: string, opts?: { name?: string; path?: string }) => {
        if (key === "projects.nameTakenSuggestRegister" && opts) {
          return `register:${opts.name}:${opts.path}`;
        }
        return key;
      }) as never,
      "orphan proj",
      [{ reason: "directory", path: "/tmp/orphan_proj", suggest_register: true }],
    );
    expect(msg).toBe("register:orphan proj:/tmp/orphan_proj");
  });
});

describe("slugifyProjectName", () => {
  it("matches sidecar slugify for latin names", () => {
    expect(slugifyProjectName("My Field Study")).toBe("my_field_study");
    expect(slugifyProjectName("  ")).toBe("project");
    expect(slugifyProjectName("Alpha")).toBe("alpha");
  });
});

describe("projectFolderName", () => {
  it("returns last path segment", () => {
    expect(projectFolderName("/Users/me/Projects/my_field_study")).toBe(
      "my_field_study",
    );
    expect(projectFolderName("C:\\data\\proj\\")).toBe("proj");
  });
});
