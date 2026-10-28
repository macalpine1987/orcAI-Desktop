import { describe, expect, it, vi, afterEach } from "vitest";
import type { JobRecord } from "../api/jobs";
import {
  cancelJob,
  createJob,
  createPredictJob,
  clearAllJobs,
  fetchJob,
  fetchJobLogSince,
  fetchJobs,
  fetchJobsQueue,
  retryJob,
} from "./jobs";

vi.mock("./sidecar", () => ({
  getSidecarBase: () => "http://127.0.0.1:8742",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function sampleJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-001",
    command: "predict",
    params: { recording_path: "/data/a.wav" },
    status: "running",
    created_at: 1000,
    updated_at: 1005,
    log: ["start"],
    result: null,
    error: null,
    progress: 0.25,
    command_line: "orcai predict /data/a.wav",
    ...overrides,
  };
}

describe("api/jobs · ", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("fetchJobs hits /v1/jobs without project_dir", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ jobs: [sampleJob()] }));
    const jobs = await fetchJobs();
    expect(jobs).toHaveLength(1);
    const [url, init] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://127.0.0.1:8742/v1/jobs");
    expect(url.searchParams.has("project_dir")).toBe(false);
    expect(init.signal).toBeDefined();
  });

  it("fetchJobs adds project_dir query", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ jobs: [] }));
    await fetchJobs("/proj/Isafjordur");
    const [url] = mockFetch.mock.calls[0] as [URL];
    expect(url.searchParams.get("project_dir")).toBe("/proj/Isafjordur");
  });

  it("fetchJobs throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 503));
    await expect(fetchJobs()).rejects.toThrow("503");
  });

  it("createJob POSTs command and params", async () => {
    const created = sampleJob({ status: "pending" });
    mockFetch.mockResolvedValueOnce(jsonResponse(created));
    const job = await createJob("init", { project_dir: "/p" });
    expect(job.id).toBe("job-001");
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      command: "init",
      params: { project_dir: "/p", verbosity: 2 },
    });
  });

  it("createPredictJob POSTs to /v1/jobs/predict", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleJob()));
    await createPredictJob({ recording_path: "/a.wav", threshold: 0.5 });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/predict");
    expect(JSON.parse(String(init.body))).toMatchObject({
      recording_path: "/a.wav",
      threshold: 0.5,
      verbosity: 2,
    });
  });

  it("cancelJob POSTs to /cancel", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(sampleJob({ status: "cancelled" })),
    );
    const job = await cancelJob("job-001");
    expect(job.status).toBe("cancelled");
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/job-001/cancel");
    expect(init.method).toBe("POST");
  });

  it("retryJob POSTs to /retry", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(sampleJob({ id: "job-002", retry_of: "job-001" })),
    );
    const job = await retryJob("job-001");
    expect(job.retry_of).toBe("job-001");
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/job-001/retry");
  });

  it("fetchJob GETs single job", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleJob()));
    await fetchJob("job-001");
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/job-001");
  });

  it("fetchJobLogSince passes since cursor", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "job-001",
        since: 3,
        next_since: 5,
        lines: ["line4", "line5"],
        progress: 0.5,
        status: "running",
        exit_code: null,
      }),
    );
    const slice = await fetchJobLogSince("job-001", 3);
    const [url] = mockFetch.mock.calls[0] as [URL];
    expect(url.searchParams.get("since")).toBe("3");
    expect(slice.lines).toEqual(["line4", "line5"]);
    expect(slice.next_since).toBe(5);
  });

  it("fetchJobsQueue GETs queue snapshot", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        max_concurrent: 2,
        running: ["a"],
        pending: ["b", "c"],
      }),
    );
    const q = await fetchJobsQueue();
    expect(q.max_concurrent).toBe(2);
    expect(q.pending).toHaveLength(2);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/queue");
  });

  it("createJob keeps an explicit verbosity", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleJob({ status: "pending" })));
    await createJob("predict", { recording_path: "/a.wav", verbosity: 0 });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).params.verbosity).toBe(0);
  });

  it("clearAllJobs POSTs to /clear", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        deleted: 5,
        cancelled_active: 1,
        project_dir: null,
      }),
    );
    const result = await clearAllJobs();
    expect(result.deleted).toBe(5);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8742/v1/jobs/clear");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("clearAllJobs passes project_dir when scoped", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        deleted: 2,
        cancelled_active: 0,
        project_dir: "/proj/a",
      }),
    );
    await clearAllJobs("/proj/a");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ project_dir: "/proj/a" });
  });
});
