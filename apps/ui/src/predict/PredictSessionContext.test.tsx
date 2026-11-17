import { readFileSync } from "node:fs";
import { act, useEffect } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ProjectRecord } from "../api/projects";
import { renderWithProviders } from "../test/render";
import {
  PredictSessionProvider,
  usePredictSession,
  predictSessionQueueSnapshotKeyForTests,
  predictSessionNavHandoffKey,
} from "./PredictSessionContext";
import {
  persistPredictQueue,
  type PredictQueue,
} from "../workspace/predictQueue";
import { saveWorkspace, WORKSPACE_CHANGED_EVENT } from "../workspace/storage";

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({
    online: true,
    engineReady: false,
    sidecarPort: null,
    capabilities: null,
  }),
}));

vi.mock("../api/projects", () => ({
  fetchProject: vi.fn(),
  fetchProjectRecordings: vi.fn(),
  fetchProjectRecordingTable: vi.fn(),
}));

type Snapshot = {
  queue: PredictQueue | null;
  activeProject: ProjectRecord | null;
  projectLoadFailed: boolean;
  queueLoading: boolean;
  hydrateFromProject: (args: {
    project: ProjectRecord;
    queue?: PredictQueue | null;
  }) => void;
};

function SessionProbe({ onSnap }: { onSnap: (snap: Snapshot) => void }) {
  const session = usePredictSession();
  useEffect(() => {
    onSnap({
      queue: session.queue,
      activeProject: session.activeProject,
      projectLoadFailed: session.projectLoadFailed,
      queueLoading: session.queueLoading,
      hydrateFromProject: session.hydrateFromProject,
    });
  }, [
    session.queue,
    session.activeProject,
    session.projectLoadFailed,
    session.queueLoading,
    session.hydrateFromProject,
    onSnap,
  ]);
  return null;
}

function project(id: string): ProjectRecord {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    initialized: true,
    focus: "recognition",
    auto_sync_recording_table: true,
  } as ProjectRecord;
}

function queueFor(projectId: string, active: string): PredictQueue {
  return {
    projectId,
    projectDir: `/tmp/${projectId}`,
    projectName: projectId,
    files: [
      {
        name: active,
        path: `/tmp/${projectId}/${active}`,
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done",
        labelPath: `/tmp/${projectId}/${active.replace(".wav", "_predicted.txt")}`,
      },
    ],
    selectedNames: [active],
    activeFileName: active,
  };
}

describe("PredictSessionProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    saveWorkspace({
      activeProjectId: "p1",
      projectDir: "/tmp/p1",
      projectName: "p1",
      predictQueue: null,
    });
  });

  it("hydrateFromProject sets queue + activeProject and clears projectLoadFailed", () => {
    let snap: Snapshot | null = null;
    const { unmount } = renderWithProviders(
      <MemoryRouter>
        <PredictSessionProvider>
          <SessionProbe
            onSnap={(s) => {
              snap = s;
            }}
          />
        </PredictSessionProvider>
      </MemoryRouter>,
    );

    const q = queueFor("p1", "a.wav");
    const rec = project("p1");
    act(() => {
      snap!.hydrateFromProject({ project: rec, queue: q });
    });

    expect(snap!.activeProject?.id).toBe("p1");
    expect(snap!.queue?.activeFileName).toBe("a.wav");
    expect(snap!.projectLoadFailed).toBe(false);
    expect(snap!.queueLoading).toBe(false);
    expect(predictSessionQueueSnapshotKeyForTests(snap!.queue)).toBe(
      predictSessionQueueSnapshotKeyForTests(q),
    );
    unmount();
  });

  it("WORKSPACE_CHANGED with a newer predictQueue updates session React state", () => {
    let snap: Snapshot | null = null;
    const { unmount } = renderWithProviders(
      <MemoryRouter>
        <PredictSessionProvider>
          <SessionProbe
            onSnap={(s) => {
              snap = s;
            }}
          />
        </PredictSessionProvider>
      </MemoryRouter>,
    );

    act(() => {
      snap!.hydrateFromProject({
        project: project("p1"),
        queue: queueFor("p1", "old.wav"),
      });
    });
    expect(snap!.queue?.activeFileName).toBe("old.wav");

    const newer = queueFor("p1", "new.wav");
    act(() => {
      persistPredictQueue(newer);
      window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
    });

    expect(snap!.queue?.activeFileName).toBe("new.wav");
    unmount();
  });
});

describe("PredictSessionProvider · audit #13 gates", () => {
  it("dedupes wav handoff by projectId + location.state (ERR-30)", () => {
    const src = readFileSync(
      new URL("./PredictSessionContext.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("navAppliedKeyRef");
    expect(src).toContain("predictSessionNavHandoffKey");
    const a = predictSessionNavHandoffKey("p1", { wavPath: "/a.wav" });
    const b = predictSessionNavHandoffKey("p1", { wavPath: "/a.wav" });
    const c = predictSessionNavHandoffKey("p1", { wavPath: "/b.wav" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("gates focus soft-refresh to engineReady + Predict route (PERF-31)", () => {
    const src = readFileSync(
      new URL("./PredictSessionContext.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("isPredictPath");
    expect(src).toMatch(
      /if\s*\(\s*!engineReady\s*\|\|\s*!onPredictRoute\s*\)\s*return/,
    );
    expect(src).toContain('window.addEventListener("focus"');
  });
});

describe("Projects→Predict navigate contract", () => {
  it("openPredict hydrates the session and navigates with tab only", () => {
    const nav = readFileSync(
      new URL("../hooks/useProjectNavActions.ts", import.meta.url),
      "utf8",
    );
    expect(nav).toContain("hydrateFromProject");
    expect(nav).toContain('navigate("/predict", { state: { tab: tabNav } })');
    expect(nav).not.toContain("queueRefreshAt");
    expect(nav).not.toContain("persistPredictQueue");
  });
});
