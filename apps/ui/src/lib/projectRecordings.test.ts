import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../api/projects";
import { canModifyProjectRecordings } from "./projectRecordings";

const base: ProjectRecord = {
  id: "p1",
  path: "/tmp/p",
  display_name: "P",
  description: "",
  orcai_name: "p",
  project_kind: "recognition",
  created_at: 0,
  updated_at: 0,
  recording_table_path: null,
  recordings_dir: "/tmp/p/recordings",
  wav_count: 0,
  initialized: false,
};

describe("canModifyProjectRecordings", () => {
  it("allows changes only after project init", () => {
    expect(canModifyProjectRecordings(null)).toBe(false);
    expect(canModifyProjectRecordings(base)).toBe(false);
    expect(
      canModifyProjectRecordings({ ...base, initialized: true }),
    ).toBe(true);
  });
});
