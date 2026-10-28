import { describe, expect, it } from "vitest";
import type { JobRecord } from "../api/jobs";
import { jobTargetLabel } from "./jobTargetLabel";

function job(params: Record<string, unknown>, extra?: Partial<JobRecord>): JobRecord {
  return {
    id: "j1",
    command: "predict",
    params,
    status: "completed",
    created_at: 0,
    updated_at: 0,
    log: [],
    result: null,
    error: null,
    ...extra,
  };
}

describe("jobTargetLabel · extended", () => {
  it("uses recording_path basename for WAV", () => {
    expect(
      jobTargetLabel(
        job({ recording_path: "/proj/recordings/07 Fjord Echo.wav" }),
      ),
    ).toBe("07 Fjord Echo.wav");
  });

  it("uses recording_path basename for CSV batch", () => {
    expect(
      jobTargetLabel(job({ recording_path: "/proj/recording_table.csv" })),
    ).toBe("recording_table.csv");
  });

  it("uses project_dir basename", () => {
    expect(jobTargetLabel(job({ project_dir: "/data/Isafjordur-2026" }))).toBe(
      "Isafjordur-2026",
    );
  });

  it("uses model_dir basename", () => {
    expect(
      jobTargetLabel(job({ model_dir: "/models/orcai-isl-v1" })),
    ).toBe("orcai-isl-v1");
  });

  it("uses output_path basename when not default", () => {
    expect(
      jobTargetLabel(job({ output_path: "/out/Whale_c1_predicted.txt" })),
    ).toBe("Whale_c1_predicted.txt");
  });

  it("ignores output_path when default", () => {
    expect(
      jobTargetLabel(
        job({ output_path: "default", project_dir: "/p/MyProject" }),
      ),
    ).toBe("MyProject");
  });

  it("falls back to first artifact basename", () => {
    expect(
      jobTargetLabel(job({}, { artifacts: ["/results/run_01/metrics.json"] })),
    ).toBe("metrics.json");
  });

  it("handles Windows-style paths", () => {
    expect(
      jobTargetLabel(
        job({ recording_path: "C:\\data\\rec\\sample.wav" }),
      ),
    ).toBe("sample.wav");
  });

  it("returns em dash when no target hints", () => {
    expect(jobTargetLabel(job({}))).toBe("—");
  });

  it("prefers recording_path over project_dir", () => {
    expect(
      jobTargetLabel(
        job({
          recording_path: "/a.wav",
          project_dir: "/proj",
        }),
      ),
    ).toBe("a.wav");
  });
});
