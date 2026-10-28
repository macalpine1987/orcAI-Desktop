import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import type {
  ProjectArtifacts,
  ProjectRecord,
  ProjectRecording,
  ProjectRecordingTable,
  ProjectSummary,
  ProjectTableRow,
} from "../api/projects";
import { renderWithProviders } from "../test/render";
import { SaveNoticeProvider } from "../ui/saveNotice";
import { saveWorkspace } from "../workspace/storage";

const navigateMock = vi.hoisted(() => vi.fn());
const summaryState = vi.hoisted(() => ({
  summary: null as ProjectSummary | null,
  loading: false,
  refresh: vi.fn(async () => undefined),
}));
const api = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  fetchProjectRecordingTable: vi.fn(),
  fetchProjectArtifacts: vi.fn(),
  fetchProjectRecordings: vi.fn(),
  fetchProjectAnnotations: vi.fn(),
  fetchProjectParameters: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({
    online: true,
    engineReady: true,
    sidecarPort: 18741,
    capabilities: null,
  }),
}));

vi.mock("../preferences/PreferencesContext", () => ({
  usePreferences: () => ({
    projectsRoot: "",
  }),
}));

vi.mock("../hooks/useProjectSummary", () => ({
  useProjectSummary: () => ({
    summary: summaryState.summary,
    loading: summaryState.loading,
    error: null,
    refresh: summaryState.refresh,
  }),
}));

vi.mock("../hooks/useJobPoller", () => ({
  useJobPoller: () => undefined,
}));

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>(
    "../api/projects",
  );
  return {
    ...actual,
    fetchProjects: (...args: unknown[]) => api.fetchProjects(...args),
    fetchProject: (...args: unknown[]) => api.fetchProject(...args),
    fetchProjectRecordingTable: (...args: unknown[]) =>
      api.fetchProjectRecordingTable(...args),
    fetchProjectArtifacts: (...args: unknown[]) =>
      api.fetchProjectArtifacts(...args),
    fetchProjectRecordings: (...args: unknown[]) =>
      api.fetchProjectRecordings(...args),
    fetchProjectAnnotations: (...args: unknown[]) =>
      api.fetchProjectAnnotations(...args),
    fetchProjectParameters: (...args: unknown[]) =>
      api.fetchProjectParameters(...args),
  };
});

import { ProjectsPage } from "./ProjectsPage";

const project = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: "p1",
  path: "/tmp/demo/Fjord",
  display_name: "Fjord",
  description: "",
  orcai_name: "Fjord",
  project_kind: "recognition",
  focus: "recognition",
  focus_source: "stored",
  created_at: 1,
  updated_at: 1,
  recording_table_path: "/tmp/demo/Fjord/recording_table.csv",
  recordings_dir: "/tmp/demo/Fjord/recordings",
  wav_count: 1,
  initialized: true,
  auto_sync_recording_table: true,
  ...over,
});

const summary = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  project_id: "p1",
  display_name: "Fjord",
  project_kind: "recognition",
  focus: "recognition",
  metrics: {
    recordings: 1,
    annotations: 0,
    predicted: 0,
    trained_models: 0,
    recordings_total: 1,
    annotations_total: 1,
  },
  primary_model_name: "orcai-isl-v1",
  recording_table: {
    path: "/tmp/demo/Fjord/recording_table.csv",
    sync_status: "current",
  },
  readiness: {
    recordings: "ready",
    annotations: "needed",
    predict: "needed",
    datasets: "empty",
    model: "ready",
  },
  readiness_lines: {
    recordings: { state: "ready", wav_count: 1, table_rows: 1 },
    annotations: { state: "needed", annotated: 0, total: 1 },
    predict: { state: "needed", predicted: 0, total: 1 },
    datasets: { state: "empty", file_count: 0, has_tvt_dir: false },
    model: { state: "ready", checkpoint_count: 0, model_name: "orcai-isl-v1" },
  },
  next_actions: ["predict"],
  ...over,
});

const row = (over: Partial<ProjectTableRow> = {}): ProjectTableRow => ({
  recording: "01.wav",
  in_table: true,
  cells: { recording: "01.wav", channel: "1" },
  wav_path: "/tmp/demo/Fjord/recordings/01.wav",
  wav_exists: true,
  size_bytes: 1024,
  duration_sec: 60,
  sample_rate_hz: 48_000,
  channels: 1,
  resample_to_hz: null,
  annotation_path: null,
  annotation_exists: false,
  predict_status: "none",
  predicted_path: null,
  channel: 1,
  duplicate: false,
  ...over,
});

const table = (rows: ProjectTableRow[]): ProjectRecordingTable => ({
  project_id: "p1",
  table_path: "/tmp/demo/Fjord/recording_table.csv",
  table_exists: true,
  updated_at: 1_757_000_000,
  columns: ["recording", "channel"],
  standard_columns: ["recording", "channel"],
  class_columns: [],
  calls: [],
  target_sampling_rate_hz: 48_000,
  default_channel: 1,
  row_count: rows.length,
  rows,
});

const artifacts = (): ProjectArtifacts => ({
  project_id: "p1",
  project_dir: "/tmp/demo/Fjord",
  items: [],
  present_count: 0,
});

const recordings = (): ProjectRecording[] => [
  {
    name: "01.wav",
    path: "/tmp/demo/Fjord/recordings/01.wav",
    rel_path: "recordings/01.wav",
    size_bytes: 1024,
    modified_at: 1,
    sample_rate_hz: 48_000,
    bit_depth: 16,
    duration_sec: 60,
  },
];

function seedWorkspace() {
  saveWorkspace({
    activeProjectId: "p1",
    activeProjectKind: "recognition",
    projectDir: "/tmp/demo/Fjord",
    projectName: "Fjord",
    recordingTablePath: "/tmp/demo/Fjord/recording_table.csv",
  });
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function predictCta(container: HTMLElement): HTMLButtonElement | null {
  const tabsRow = container.querySelector(".ps-tabs-row");
  if (!tabsRow) return null;
  const buttons = Array.from(tabsRow.querySelectorAll("button"));
  return (
    (buttons.find((b) =>
      /Распознать|Predict/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement | undefined) ?? null
  );
}

async function renderStudio(opts?: {
  syncStatus?: ProjectSummary["recording_table"]["sync_status"];
  autoSync?: boolean;
  rows?: ProjectTableRow[];
}) {
  const syncStatus = opts?.syncStatus ?? "current";
  const autoSync = opts?.autoSync ?? true;
  const rows = opts?.rows ?? [row()];
  const p = project({
    auto_sync_recording_table: autoSync,
    wav_count: rows.filter((r) => r.wav_exists).length,
  });
  summaryState.summary = summary({
    recording_table: {
      path: p.recording_table_path,
      sync_status: syncStatus,
    },
    auto_sync_recording_table: autoSync,
  });
  api.fetchProjects.mockResolvedValue([p]);
  api.fetchProject.mockResolvedValue(p);
  api.fetchProjectRecordingTable.mockResolvedValue(table(rows));
  api.fetchProjectArtifacts.mockResolvedValue(artifacts());
  api.fetchProjectRecordings.mockResolvedValue(recordings());

  const result = renderWithProviders(
    <SaveNoticeProvider>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </SaveNoticeProvider>,
  );
  await flushUi();
  await flushUi();
  return result;
}

describe("ProjectsPage · tab-strip predict CTA", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    summaryState.summary = null;
    summaryState.refresh.mockReset();
    summaryState.refresh.mockResolvedValue(undefined);
    for (const fn of Object.values(api)) fn.mockReset();
    seedWorkspace();
  });

  it("shows enabled Predict CTA when recording table is current", async () => {
    const { container, unmount } = await renderStudio({ syncStatus: "current" });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);
    expect(btn!.getAttribute("title") ?? "").toMatch(
      /every project WAV|все WAV|openInPredict/i,
    );
    unmount();
  });

  it("disables Predict CTA with stale-table title when CSV is stale", async () => {
    const { container, unmount } = await renderStudio({ syncStatus: "stale" });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    expect(btn!.getAttribute("title") ?? "").toMatch(
      /recording_table\.csv|Обновите|Refresh/i,
    );
    unmount();
  });

  it("disables Predict CTA when recording table is missing", async () => {
    const { container, unmount } = await renderStudio({ syncStatus: "missing" });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    expect(btn!.getAttribute("title") ?? "").toMatch(
      /recording_table\.csv|Обновите|Refresh/i,
    );
    unmount();
  });

  it("still blocks Predict when auto-sync is on but CSV is stale", async () => {
    const { container, unmount } = await renderStudio({
      syncStatus: "stale",
      autoSync: true,
    });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    unmount();
  });

  it("disables Predict CTA when there are no WAV rows", async () => {
    const { container, unmount } = await renderStudio({
      syncStatus: "current",
      rows: [],
    });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    unmount();
  });

  it("navigates to /predict with run tab when CTA is clicked", async () => {
    const { container, unmount } = await renderStudio({ syncStatus: "current" });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);

    await act(async () => {
      btn!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.fetchProjectRecordings).toHaveBeenCalledWith("p1");
    expect(navigateMock).toHaveBeenCalledWith("/predict", {
      state: { tab: "run" },
    });
    unmount();
  });

  it("does not navigate when Predict is blocked by stale CSV", async () => {
    const { container, unmount } = await renderStudio({ syncStatus: "stale" });
    const btn = predictCta(container);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);

    await act(async () => {
      btn!.click();
      await Promise.resolve();
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(api.fetchProjectRecordings).not.toHaveBeenCalled();
    unmount();
  });
});
