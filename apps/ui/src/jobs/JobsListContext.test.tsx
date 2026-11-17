import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "../api/jobs";
import { renderWithProviders } from "../test/render";
import { resetWorkspace, saveWorkspace } from "../workspace/storage";
import { JobsListProvider, useJobsListContext } from "./JobsListContext";

const fetchJobs = vi.hoisted(() => vi.fn());

vi.mock("../api/jobs", () => ({
  fetchJobs: (...args: unknown[]) => fetchJobs(...args),
}));

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({ online: true, engineReady: true }),
}));

vi.mock("../hooks/useJobsProgressStream", () => ({
  useJobsProgressStream: () => undefined,
}));

function job(id: string, projectDir: string, createdAt: number): JobRecord {
  return {
    id,
    command: "predict",
    params: { project_dir: projectDir },
    status: "completed",
    created_at: createdAt,
    updated_at: createdAt,
    log: [],
    result: null,
    error: null,
  };
}

const pendingInsert: { current: JobRecord | null } = { current: null };

function Probe() {
  const { jobs, upsertJob, loading, refresh } = useJobsListContext();
  return (
    <>
      <output data-scope-ids>{jobs.map((row) => row.id).join(",")}</output>
      <output data-loading>{loading ? "1" : "0"}</output>
      <button
        type="button"
        onClick={() => {
          if (pendingInsert.current) upsertJob(pendingInsert.current);
        }}
      >
        insert
      </button>
      <button type="button" data-refresh onClick={() => void refresh()}>
        refresh
      </button>
    </>
  );
}

function idsOf(container: ParentNode): string {
  return container.querySelector("[data-scope-ids]")?.textContent ?? "";
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("jobs list follows the active project", () => {
  afterEach(() => {
    fetchJobs.mockReset();
    pendingInsert.current = null;
    resetWorkspace();
  });

  it("loads only the active project and ignores another project's live insert", async () => {
    fetchJobs.mockImplementation(async (dir: string) => {
      if (dir === "/proj/a") return [job("a", "/proj/a", 10)];
      if (dir === "/proj/b") return [job("b", "/proj/b", 20)];
      return [];
    });
    saveWorkspace({ activeProjectId: "a", projectDir: "/proj/a" });

    const { container, unmount } = renderWithProviders(
      <JobsListProvider pollMs={60_000}>
        <Probe />
      </JobsListProvider>,
    );
    await settle();
    expect(fetchJobs).toHaveBeenCalledWith("/proj/a");
    expect(idsOf(container)).toBe("a");

    await act(async () => {
      saveWorkspace({ activeProjectId: "b", projectDir: "/proj/b" });
    });
    await settle();
    expect(fetchJobs).toHaveBeenCalledWith("/proj/b");
    expect(idsOf(container)).toBe("b");

    pendingInsert.current = job("foreign", "/proj/a", 30);
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(idsOf(container)).toBe("b");

    pendingInsert.current = job("own", "/proj/b/", 40);
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(idsOf(container)).toBe("own,b");
    unmount();
  });

  it("stays empty when no project is active", async () => {
    fetchJobs.mockResolvedValue([job("a", "/proj/a", 10)]);
    saveWorkspace({ activeProjectId: null, projectDir: "/proj/a" });
    const { container, unmount } = renderWithProviders(
      <JobsListProvider pollMs={60_000}>
        <Probe />
      </JobsListProvider>,
    );
    await settle();
    expect(fetchJobs).not.toHaveBeenCalled();
    expect(idsOf(container)).toBe("");
    unmount();
  });

  it("does not flip loading on empty-list refresh after first hydrate", async () => {
    fetchJobs.mockResolvedValue([]);
    saveWorkspace({ activeProjectId: "a", projectDir: "/proj/a" });
    const { container, unmount } = renderWithProviders(
      <JobsListProvider pollMs={60_000}>
        <Probe />
      </JobsListProvider>,
    );
    await settle();
    expect(idsOf(container)).toBe("");
    expect(container.querySelector("[data-loading]")?.textContent).toBe("0");
    const callsAfterHydrate = fetchJobs.mock.calls.length;

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-refresh]")?.click();
    });
    await settle();
    expect(fetchJobs.mock.calls.length).toBeGreaterThan(callsAfterHydrate);
    expect(container.querySelector("[data-loading]")?.textContent).toBe("0");
    unmount();
  });
});
