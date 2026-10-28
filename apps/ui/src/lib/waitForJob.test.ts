import { describe, expect, it, vi, afterEach } from "vitest";
import { JobWaitTimeoutError, waitForJobTerminal } from "./waitForJob";
import * as jobsApi from "../api/jobs";

describe("waitForJobTerminal · ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runningJob = {
    id: "j1",
    command: "import-audio",
    status: "running" as const,
    params: {},
    created_at: 0,
    updated_at: 0,
    log: [] as string[],
    result: null,
    error: null,
  };

  it("returns immediately when job already terminal", async () => {
    const completed = { ...runningJob, status: "completed" as const };
    vi.spyOn(jobsApi, "fetchJob").mockResolvedValue(completed);
    await expect(waitForJobTerminal("j1")).resolves.toEqual(completed);
    expect(jobsApi.fetchJob).toHaveBeenCalledTimes(1);
  });

  it("polls until job completes", async () => {
    vi.useFakeTimers();
    vi.spyOn(jobsApi, "fetchJob")
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce({ ...runningJob, status: "completed" as const });
    const pending = waitForJobTerminal("j1");
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("completed");
    expect(jobsApi.fetchJob).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("cancels and returns when shouldCancel is true", async () => {
    vi.spyOn(jobsApi, "fetchJob").mockResolvedValue(runningJob);
    vi.spyOn(jobsApi, "cancelJob").mockResolvedValue({
      ...runningJob,
      status: "cancelled" as const,
    });
    const result = await waitForJobTerminal("j1", () => true);
    expect(jobsApi.cancelJob).toHaveBeenCalledWith("j1");
    expect(result.status).toBe("running");
  });

  it("throws JobWaitTimeoutError when job stays running", async () => {
    vi.spyOn(jobsApi, "fetchJob").mockResolvedValue(runningJob);
    vi.spyOn(jobsApi, "cancelJob").mockResolvedValue({
      ...runningJob,
      status: "cancelled" as const,
    });

    await expect(
      waitForJobTerminal("j1", undefined, { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(JobWaitTimeoutError);
    expect(jobsApi.cancelJob).toHaveBeenCalledWith("j1");
  });

  it("JobWaitTimeoutError carries job id", async () => {
    vi.spyOn(jobsApi, "fetchJob").mockResolvedValue(runningJob);
    vi.spyOn(jobsApi, "cancelJob").mockRejectedValue(new Error("gone"));
    try {
      await waitForJobTerminal("job-xyz", undefined, { timeoutMs: 1 });
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(JobWaitTimeoutError);
      expect((e as JobWaitTimeoutError).jobId).toBe("job-xyz");
    }
  });
});
