import { describe, expect, it } from "vitest";
import type { JobRecord } from "../api/jobs";
import {
  isTerminalJobStatus,
  parseJobStreamPayload,
  patchJobFromStream,
} from "./jobEventStream";

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "j1",
    command: "predict",
    params: {},
    status: "running",
    created_at: 0,
    updated_at: 0,
    log: ["a"],
    result: null,
    error: null,
    progress: 0.1,
    ...overrides,
  };
}

describe("jobEventStream", () => {
  it("parseJobStreamPayload accepts JSON", () => {
    expect(
      parseJobStreamPayload('{"type":"progress","progress":0.5}'),
    ).toEqual({ type: "progress", progress: 0.5 });
    expect(parseJobStreamPayload("not-json")).toBeNull();
  });

  it("patchJobFromStream updates progress and status", () => {
    const next = patchJobFromStream(job(), {
      type: "progress",
      progress: 0.62,
      status: "running",
    });
    expect(next.progress).toBe(0.62);
  });

  it("patchJobFromStream applies started_at from status events", () => {
    const next = patchJobFromStream(job({ started_at: null }), {
      type: "status",
      status: "running",
      started_at: 1700,
    });
    expect(next.status).toBe("running");
    expect(next.started_at).toBe(1700);
  });

  it("patchJobFromStream appends log by index", () => {
    const next = patchJobFromStream(job({ log: ["a"] }), {
      type: "log",
      line: "b",
      index: 1,
    });
    expect(next.log).toEqual(["a", "b"]);
  });

  it("isTerminalJobStatus detects completed", () => {
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
  });
});
