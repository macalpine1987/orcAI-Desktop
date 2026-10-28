import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { JobRecord } from "../api/jobs";

const fetchJobLogSinceMock = vi.fn();
const connectJobEventStreamMock = vi.fn();

vi.mock("../api/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/jobs")>();
  return {
    ...actual,
    fetchJobLogSince: (...args: unknown[]) => fetchJobLogSinceMock(...args),
  };
});

vi.mock("../lib/jobEventStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/jobEventStream")>();
  return {
    ...actual,
    connectJobEventStream: (...args: unknown[]) =>
      connectJobEventStreamMock(...args),
  };
});

import { useJobLogTail } from "./useJobLogTail";

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-tail-1",
    command: "predict",
    params: {},
    status: "running",
    created_at: 0,
    updated_at: 0,
    log: ["seed-line"],
    result: null,
    error: null,
    ...overrides,
  };
}

function LogProbe({
  job,
  online,
  onLines,
}: {
  job: JobRecord | null;
  online: boolean;
  onLines: (lines: string[]) => void;
}) {
  const lines = useJobLogTail(job, online);
  useEffect(() => {
    onLines(lines);
  }, [lines, onLines]);
  return null;
}

describe("useJobLogTail · ", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestLines: string[] = [];
  let streamHandlers: {
    onLog?: (payload: { type: string; line: string; index: number }) => void;
    onStatus?: (payload: { type: string; status: string }) => void;
    onError?: () => void;
  } = {};

  beforeEach(() => {
    latestLines = [];
    streamHandlers = {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchJobLogSinceMock.mockReset();
    connectJobEventStreamMock.mockReset();
    connectJobEventStreamMock.mockImplementation(
      (_jobId: string, _since: number, handlers: typeof streamHandlers) => {
        streamHandlers = handlers;
        return () => undefined;
      },
    );
    fetchJobLogSinceMock.mockResolvedValue({
      id: "job-tail-1",
      since: 1,
      next_since: 1,
      lines: [],
      progress: null,
      status: "running",
      exit_code: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const renderProbe = (jobRecord: JobRecord | null, online = true) => {
    act(() => {
      root.render(
        <LogProbe
          job={jobRecord}
          online={online}
          onLines={(lines) => {
            latestLines = lines;
          }}
        />,
      );
    });
  };

  it("seeds lines from job.log when job id changes", async () => {
    renderProbe(job({ log: ["alpha", "beta"] }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(latestLines).toEqual(["alpha", "beta"]);
    expect(connectJobEventStreamMock).toHaveBeenCalledWith(
      "job-tail-1",
      2,
      expect.any(Object),
    );
  });

  it("clears lines when job is null", async () => {
    renderProbe(job());
    await act(async () => {
      await Promise.resolve();
    });
    renderProbe(null);
    await act(async () => {
      await Promise.resolve();
    });
    expect(latestLines).toEqual([]);
  });

  it("does not connect when sidecar offline", async () => {
    renderProbe(job(), false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(latestLines).toEqual(["seed-line"]);
    expect(connectJobEventStreamMock).not.toHaveBeenCalled();
  });

  it("appends log lines from SSE", async () => {
    renderProbe(job({ log: ["seed-line"] }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      streamHandlers.onLog?.({ type: "log", line: "delta", index: 1 });
    });
    expect(latestLines).toEqual(["seed-line", "delta"]);
  });

  it("falls back to poll when SSE errors", async () => {
    fetchJobLogSinceMock.mockResolvedValueOnce({
      id: "job-tail-1",
      since: 1,
      next_since: 2,
      lines: ["polled"],
      progress: null,
      status: "running",
      exit_code: null,
    });
    renderProbe(job({ log: ["seed-line"] }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      streamHandlers.onError?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchJobLogSinceMock).toHaveBeenCalled();
    expect(latestLines).toEqual(["seed-line", "polled"]);
  });

  it("does not repeat the last line when completion polls the same tail", async () => {
    fetchJobLogSinceMock.mockImplementation(async (_id: string, since: number) => ({
      id: "job-tail-1",
      since,
      next_since: Math.max(since, 2),
      lines: since < 2 ? ["Batch finished: 13/13 files"] : [],
      progress: 1,
      status: "completed",
      exit_code: 0,
    }));
    renderProbe(job({ log: ["seed-line"] }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      streamHandlers.onLog?.({
        type: "log",
        line: "Batch finished: 13/13 files",
        index: 1,
      });
      streamHandlers.onStatus?.({ type: "status", status: "completed" });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latestLines).toEqual(["seed-line", "Batch finished: 13/13 files"]);
    expect(fetchJobLogSinceMock).toHaveBeenCalledWith("job-tail-1", 2);
  });
});
