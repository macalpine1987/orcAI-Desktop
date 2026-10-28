import { describe, expect, it, vi, afterEach } from "vitest";
import type { JobRecord } from "../api/jobs";

const revealMock = vi.fn();

vi.mock("../platform/shell", () => ({
  revealInFileManager: (...args: unknown[]) => revealMock(...args),
}));

import { jobResultPath, revealJobResult } from "./jobOpenResult";

function completedJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "abc12345-0000-0000-0000-000000000001",
    command: "predict",
    params: { output_path: "/tmp/out/predicted.txt" },
    status: "completed",
    created_at: 0,
    updated_at: 1,
    log: [],
    result: { predicted_path: "/tmp/out/predicted.txt" },
    error: null,
    ...overrides,
  };
}

describe("jobOpenResult · extended", () => {
  afterEach(() => {
    revealMock.mockReset();
    vi.restoreAllMocks();
  });

  it("jobResultPath prefers artifacts over result keys", () => {
    expect(
      jobResultPath(
        completedJob({
          artifacts: ["/artifacts/first.txt"],
          result: { path: "/result/other.txt" },
        }),
      ),
    ).toBe("/artifacts/first.txt");
  });

  it("jobResultPath reads result output_path key", () => {
    expect(
      jobResultPath(
        completedJob({
          artifacts: undefined,
          result: { output_path: "/out/x.txt" },
        }),
      ),
    ).toBe("/out/x.txt");
  });

  it("jobResultPath reads params.output_path when not default", () => {
    expect(
      jobResultPath(
        completedJob({
          artifacts: undefined,
          result: null,
          params: { output_path: "/params/out.txt" },
        }),
      ),
    ).toBe("/params/out.txt");
  });

  it("jobResultPath ignores params.output_path default", () => {
    expect(
      jobResultPath(
        completedJob({
          artifacts: undefined,
          result: null,
          params: { output_path: "default" },
        }),
      ),
    ).toBeNull();
  });

  it("jobResultPath returns null for non-completed", () => {
    expect(jobResultPath(completedJob({ status: "failed" }))).toBeNull();
  });

  it("revealJobResult calls revealInFileManager with resolved path", async () => {
    revealMock.mockResolvedValue(true);
    const j = completedJob();
    expect(await revealJobResult(j)).toBe(true);
    expect(revealMock).toHaveBeenCalledWith("/tmp/out/predicted.txt");
  });

  it("revealJobResult returns false when no path", async () => {
    expect(await revealJobResult(completedJob({ result: null, params: {} }))).toBe(
      false,
    );
    expect(revealMock).not.toHaveBeenCalled();
  });
});
