import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "../../test/render";
import type { JobRecord } from "../../api/jobs";
import { resetWorkspace, saveWorkspace } from "../../workspace/storage";
import {
  HOME_RECENT_JOBS_LIMIT,
  HomeRecentJobs,
} from "./HomeRecentJobs";

const jobsMock = vi.hoisted(() => ({
  jobs: [] as JobRecord[],
  loading: false,
}));

const sidecarMock = vi.hoisted(() => ({
  online: true,
  engineReady: true,
}));

vi.mock("../../hooks/useJobsList", () => ({
  useJobsListContext: () => ({
    jobs: jobsMock.jobs,
    loading: jobsMock.loading,
  }),
}));

vi.mock("../../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({
    online: sidecarMock.online,
    engineReady: sidecarMock.engineReady,
  }),
}));

vi.mock("../../preferences/PreferencesContext", () => ({
  usePreferences: () => ({
    defaultDockCollapsed: true,
  }),
}));

function makeJob(
  partial: Partial<JobRecord> & Pick<JobRecord, "id" | "command" | "status">,
): JobRecord {
  return {
    id: partial.id,
    command: partial.command,
    status: partial.status,
    created_at: partial.created_at ?? 1_725_280_800,
    updated_at: partial.updated_at ?? 1_725_281_100,
    params: partial.params ?? {},
    log: partial.log ?? [],
    result: partial.result ?? null,
    error: partial.error ?? null,
    progress: partial.progress ?? null,
    artifacts: partial.artifacts ?? [],
  };
}

describe("HomeRecentJobs · D-01", () => {
  beforeEach(() => {
    resetWorkspace();
  });

  it("exports adaptive HOME_RECENT_JOBS_LIMIT (max ≥ 4)", () => {
    expect(HOME_RECENT_JOBS_LIMIT).toBeGreaterThanOrEqual(4);
  });

  it("renders a bounded recent list and five columns (jsdom: min 4)", () => {
    sidecarMock.online = true;
    sidecarMock.engineReady = true;
    saveWorkspace({ activeProjectId: "proj", projectDir: "/proj" });
    jobsMock.jobs = Array.from({ length: 6 }, (_, i) =>
      makeJob({
        id: `j${i}`,
        command: "predict",
        status: i === 0 ? "running" : "completed",
        updated_at: 1_725_281_000 + i,
      }),
    );
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    // Zero panel height in jsdom → MIN visible rows.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    const headers = Array.from(container.querySelectorAll("th")).map(
      (th) => th.textContent ?? "",
    );
    expect(headers.length).toBe(5);
    expect(headers.join(" ")).toMatch(/Command|Команда/i);
    expect(headers.join(" ")).toMatch(/Status|Статус/i);
    expect(headers.join(" ")).toMatch(/Finished|Завершена/i);
    expect(container.querySelector('a.jobs-action-link[href="/jobs"]')).toBeTruthy();
    unmount();
  });

  it("disables All jobs link when engine is not ready", () => {
    sidecarMock.online = true;
    sidecarMock.engineReady = false;
    jobsMock.jobs = [];
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    expect(container.querySelector("a.jobs-action-link")).toBeNull();
    const disabled = container.querySelector(".jobs-action-link--disabled");
    expect(disabled).toBeTruthy();
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");
    unmount();
  });

  it("disables All jobs link when no project is active", () => {
    sidecarMock.online = true;
    sidecarMock.engineReady = true;
    jobsMock.jobs = [];
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    expect(container.querySelector("a.jobs-action-link")).toBeNull();
    const disabled = container.querySelector(".jobs-action-link--disabled");
    expect(disabled).toBeTruthy();
    expect(disabled?.getAttribute("title")).toMatch(/проект|project/i);
    unmount();
  });

  it("running job has no finished timestamp; completed does", () => {
    sidecarMock.online = true;
    sidecarMock.engineReady = true;
    saveWorkspace({ activeProjectId: "proj", projectDir: "/proj" });
    jobsMock.jobs = [
      makeJob({
        id: "run",
        command: "predict",
        status: "running",
        updated_at: 1_725_282_000,
      }),
      makeJob({
        id: "done",
        command: "filter-predictions",
        status: "completed",
        updated_at: 1_725_281_500,
      }),
    ];
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    const runningFinished = rows[0]?.querySelectorAll("td")[4]?.textContent;
    const doneFinished = rows[1]?.querySelectorAll("td")[4]?.textContent;
    expect(runningFinished?.trim()).toBe("—");
    expect(doneFinished?.trim()).not.toBe("—");
    expect(doneFinished?.trim().length).toBeGreaterThan(0);
    expect(container.querySelector(".job-status-pill")).toBeTruthy();
    expect(container.querySelector(".jobs-command-label")).toBeTruthy();
    expect(container.querySelector(".jobs-command-cell .jobs-status-dot")).toBeNull();
    expect(container.querySelector(".home-recent-jobs-header")).toBeTruthy();
    expect(container.querySelector(".home-recent-jobs-panel")).toBeTruthy();
    unmount();
  });

  it("keeps the jobs table mounted when sidecar goes offline (no remount flicker)", () => {
    jobsMock.jobs = [
      makeJob({ id: "j1", command: "predict", status: "completed" }),
    ];
    sidecarMock.online = false;
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("table.jobs-table")).toBeTruthy();
    // With jobs already listed, do not show the “start Sidecar” offline tip.
    expect(container.textContent).not.toMatch(
      /Запустите Sidecar|Start Sidecar to see the job queue/i,
    );
    unmount();
  });

  it("shows the offline tip only when the recent list is empty", () => {
    jobsMock.jobs = [];
    sidecarMock.online = false;
    const { container, unmount } = renderWithProviders(
      <MemoryRouter>
        <HomeRecentJobs />
      </MemoryRouter>,
    );
    expect(container.querySelector("table.jobs-table")).toBeNull();
    expect(container.textContent).toMatch(
      /Запустите Sidecar|Start Sidecar to see the job queue/i,
    );
    unmount();
  });
});
