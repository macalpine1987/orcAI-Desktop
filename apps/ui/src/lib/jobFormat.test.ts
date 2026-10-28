import { describe, expect, it } from "vitest";
import type { JobRecord } from "../api/jobs";
import {
  filterJobs,
  formatDuration,
  formatJobTime,
  isJobProgressIndeterminate,
  jobDurationSec,
  jobProgressPercent,
  jobStatusI18nKey,
  mergeJobRecords,
  pickActiveJob,
  sortJobsNewestFirst,
  jobsListsDisplayEqual,
} from "./jobFormat";

function job(
  overrides: Partial<JobRecord> & Pick<JobRecord, "id" | "status">,
): JobRecord {
  return {
    command: "predict",
    params: {},
    created_at: 1000,
    updated_at: 1060,
    log: [],
    result: null,
    error: null,
    ...overrides,
  };
}

describe("jobFormat · / extended", () => {
  it("formatDuration mm:ss", () => {
    expect(formatDuration(252)).toBe("04:12");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("jobDurationSec uses updated_at for terminal jobs", () => {
    const j = job({ id: "a", status: "completed", created_at: 100, updated_at: 250 });
    expect(jobDurationSec(j)).toBe(150);
  });

  it("jobDurationSec uses started_at when present (excludes queue wait)", () => {
    const j = job({
      id: "hps",
      status: "running",
      created_at: 1000,
      started_at: 1300,
      updated_at: 1300,
    });
    expect(jobDurationSec(j, 1360)).toBe(60);
  });

  it("jobDurationSec terminal uses started_at when present", () => {
    const j = job({
      id: "hps",
      status: "completed",
      created_at: 1000,
      started_at: 1300,
      updated_at: 1400,
    });
    expect(jobDurationSec(j)).toBe(100);
  });

  it("jobProgressPercent maps status", () => {
    expect(jobProgressPercent(job({ id: "a", status: "completed" }))).toBe(100);
    expect(
      jobProgressPercent(job({ id: "b", status: "running", progress: 0.4 })),
    ).toBe(40);
    expect(jobProgressPercent(job({ id: "c", status: "pending" }))).toBeNull();
    expect(
      jobProgressPercent(job({ id: "z", status: "running", progress: 0 })),
    ).toBeNull();
  });

  it("isJobProgressIndeterminate for running without numeric progress", () => {
    expect(
      isJobProgressIndeterminate(job({ id: "r", status: "running" })),
    ).toBe(true);
    expect(
      isJobProgressIndeterminate(
        job({ id: "z", status: "running", progress: 0 }),
      ),
    ).toBe(true);
    expect(
      isJobProgressIndeterminate(
        job({ id: "p", status: "running", progress: 0.25 }),
      ),
    ).toBe(false);
    expect(
      isJobProgressIndeterminate(job({ id: "c", status: "completed" })),
    ).toBe(false);
  });

  it("filterJobs active/errors/history", () => {
    const jobs = [
      job({ id: "1", status: "running" }),
      job({ id: "2", status: "pending" }),
      job({ id: "3", status: "failed" }),
      job({ id: "4", status: "completed" }),
      job({ id: "5", status: "cancelled" }),
    ];
    expect(filterJobs(jobs, "active")).toHaveLength(2);
    expect(filterJobs(jobs, "errors")).toHaveLength(1);
    expect(filterJobs(jobs, "history")).toHaveLength(3);
  });

  it("pickActiveJob prefers running over pending", () => {
    const jobs = [
      job({ id: "p", status: "pending" }),
      job({ id: "r", status: "running" }),
    ];
    expect(pickActiveJob(jobs)?.id).toBe("r");
  });

  it("pickActiveJob picks oldest pending (FIFO) when list is newest-first", () => {
    const jobs = [
      job({ id: "test", status: "pending", created_at: 300 }),
      job({ id: "train", status: "pending", created_at: 200 }),
      job({ id: "tvt", status: "pending", created_at: 100 }),
    ];
    expect(pickActiveJob(jobs)?.id).toBe("tvt");
  });

  it("sortJobsNewestFirst", () => {
    const jobs = [
      job({ id: "old", status: "completed", created_at: 1 }),
      job({ id: "new", status: "completed", created_at: 99 }),
    ];
    expect(sortJobsNewestFirst(jobs)[0]?.id).toBe("new");
  });

  it("formatDuration zero-pads seconds and minutes", () => {
    expect(formatDuration(9)).toBe("00:09");
    expect(formatDuration(59)).toBe("00:59");
  });

  it("jobDurationSec uses now for running jobs", () => {
    const j = job({
      id: "run",
      status: "running",
      created_at: 1000,
      updated_at: 1000,
    });
    expect(jobDurationSec(j, 1060)).toBe(60);
  });

  it("jobProgressPercent clamps running progress to 0–100", () => {
    expect(
      jobProgressPercent(job({ id: "a", status: "running", progress: 1.5 })),
    ).toBe(100);
    // Negative / zero while running → indeterminate (no percent label).
    expect(
      jobProgressPercent(job({ id: "b", status: "running", progress: -0.2 })),
    ).toBeNull();
  });

  it("jobProgressPercent shows partial progress on failed when present", () => {
    expect(
      jobProgressPercent(job({ id: "f", status: "failed", progress: 0.33 })),
    ).toBe(33);
    expect(jobProgressPercent(job({ id: "g", status: "failed" }))).toBeNull();
  });

  it("jobStatusI18nKey maps all statuses", () => {
    expect(jobStatusI18nKey("pending")).toBe("jobs.status.pending");
    expect(jobStatusI18nKey("cancelled")).toBe("jobs.status.cancelled");
  });

  it("formatJobTime returns locale time string", () => {
    const formatted = formatJobTime(1_704_067_200);
    expect(formatted).toMatch(/\d/);
  });

  it("filterJobs all returns input unchanged", () => {
    const jobs = [job({ id: "1", status: "running" })];
    expect(filterJobs(jobs, "all")).toEqual(jobs);
  });

  it("filterJobs empty input", () => {
    expect(filterJobs([], "active")).toEqual([]);
    expect(filterJobs([], "errors")).toEqual([]);
  });

  it("pickActiveJob returns pending when no running", () => {
    const jobs = [job({ id: "p", status: "pending", created_at: 1 })];
    expect(pickActiveJob(jobs)?.id).toBe("p");
  });

  it("pickActiveJob returns null for empty queue", () => {
    expect(pickActiveJob([])).toBeNull();
  });

  it("jobsListsDisplayEqual ignores identical poll snapshots", () => {
    const a = [job({ id: "1", status: "completed", progress: 1 })];
    const b = [job({ id: "1", status: "completed", progress: 1 })];
    expect(jobsListsDisplayEqual(a, b)).toBe(true);
    b[0] = job({ id: "1", status: "failed", progress: 1 });
    expect(jobsListsDisplayEqual(a, b)).toBe(false);
  });

  it("mergeJobRecords keeps longer log and does not regress status", () => {
    const fresh = job({
      id: "1",
      status: "completed",
      updated_at: 2000,
      log: ["Queued", "[1/2] a.wav", "Done: 2"],
      progress: 1,
    });
    const stale = job({
      id: "1",
      status: "pending",
      updated_at: 1000,
      log: ["Queued"],
      progress: null,
    });
    const merged = mergeJobRecords(fresh, stale);
    expect(merged.status).toBe("completed");
    expect(merged.log).toEqual(fresh.log);
    expect(merged.progress).toBe(1);
  });
});
