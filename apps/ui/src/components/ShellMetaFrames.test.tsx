import { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "../test/render";
import { ShellMetaFrames } from "./ShellMetaFrames";

const applyActiveProjectMock = vi.fn();
const fetchProjectsMock = vi.fn();
const fetchModelsMock = vi.fn();

let mockRuntimeStep: "idle" | "starting_engine" | "ready" = "ready";
let mockGracefulRuntimeRestart = false;

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({
    runtimeStep: mockRuntimeStep,
    online: true,
    engineReady: mockRuntimeStep === "ready",
    gracefulRuntimeRestart: mockGracefulRuntimeRestart,
  }),
}));

vi.mock("../workspace/project", () => ({
  applyActiveProject: (...args: unknown[]) => applyActiveProjectMock(...args),
}));

vi.mock("../api/projects", () => ({
  fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
}));

vi.mock("../api/models", () => ({
  fetchModels: (...args: unknown[]) => fetchModelsMock(...args),
}));

describe("ShellMetaFrames · quick pick", () => {
  beforeEach(() => {
    mockRuntimeStep = "ready";
    mockGracefulRuntimeRestart = false;
    applyActiveProjectMock.mockReset();
    fetchProjectsMock.mockReset();
    fetchModelsMock.mockReset();
    fetchModelsMock.mockResolvedValue([]);
    fetchProjectsMock.mockResolvedValue([
      {
        id: "p1",
        display_name: "Alpha",
        path: "/tmp/Alpha",
        description: "",
        orcai_name: "Alpha",
        project_kind: "recognition",
        created_at: 1,
        updated_at: 1,
        wav_count: 0,
        initialized: true,
        recording_table_path: null,
        recordings_dir: "/tmp/Alpha/recordings",
      },
    ]);
  });

  it("hides project/model frames when engine is not running", () => {
    mockRuntimeStep = "idle";
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Alpha"
        modelId="orcai-isl-v1"
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(0);
    expect(container.textContent).toMatch(/движок|engine/i);
    unmount();
  });

  it("hides project/model frames while engine is starting", () => {
    mockRuntimeStep = "starting_engine";
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Alpha"
        modelId="orcai-isl-v1"
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(0);
    unmount();
  });

  it("keeps engine readout short during CPU/GPU restart (banner carries the message)", () => {
    mockGracefulRuntimeRestart = true;
    mockRuntimeStep = "ready";
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Alpha"
        modelId="orcai-isl-v1"
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.querySelector(".shell-meta-frame--restart")).toBeNull();
    expect(container.textContent).not.toMatch(
      /среда выполнения|neural-network device/i,
    );
    expect(container.textContent).toMatch(/загрузка|loading/i);
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(0);
    unmount();
  });

  it("shows model as static readout without chevron or picker", () => {
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Alpha"
        modelId="orcai-nor-v1"
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(1);
    expect(container.querySelector(".shell-meta-chevron")).toBeTruthy();
    expect(container.textContent).toMatch(/orcai-nor-v1/);
    const modelFrame = Array.from(
      container.querySelectorAll(".shell-meta-frame:not(.shell-meta-frame--button)"),
    ).find((el) => el.textContent?.includes("orcai-nor-v1"));
    expect(modelFrame).toBeTruthy();
    expect(modelFrame?.querySelector(".shell-meta-chevron")).toBeNull();
    unmount();
  });

  it("hides model frame when showModel is false", () => {
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        showModel={false}
        projectName="Alpha"
        modelId="orcai-nor-v1"
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/orcai-nor-v1/);
    unmount();
  });

  it("shows dash for model without active project", () => {
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName={null}
        modelId="orcai-isl-v1"
        hasActiveProject={false}
        activeProjectId={null}
        projectDir={null}
      />,
    );
    expect(container.querySelectorAll("button.shell-meta-frame--button")).toHaveLength(1);
    expect(container.textContent).toMatch(/—/);
    unmount();
  });

  it("shows trained model name instead of absolute path", async () => {
    const trainedPath = "/tmp/Alpha/models/fjord-v2";
    fetchModelsMock.mockResolvedValue([
      {
        id: trainedPath,
        name: "fjord-v2",
        path: trainedPath,
        kind: "trained",
      },
    ]);
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Alpha"
        modelId={trainedPath}
        hasActiveProject
        activeProjectId="p1"
        projectDir="/tmp/Alpha"
      />,
    );
    expect(container.textContent).toMatch(/fjord-v2/);
    expect(container.textContent).not.toMatch(/\/tmp\/Alpha\/models/);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchModelsMock).toHaveBeenCalledWith("/tmp/Alpha");
    expect(container.textContent).toMatch(/fjord-v2/);
    unmount();
  });

  it("opens project popover and activates selected project", async () => {
    const { container, unmount } = renderWithProviders(
      <ShellMetaFrames
        showEngine
        projectName="Beta"
        modelId="orcai-isl-v1"
        hasActiveProject
        activeProjectId="p2"
        projectDir="/tmp/Beta"
      />,
    );
    const projectBtn = container.querySelector(
      "button.shell-meta-frame--button",
    ) as HTMLButtonElement;
    await act(async () => {
      projectBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchProjectsMock).toHaveBeenCalled();
    const option = Array.from(container.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes("Alpha"),
    ) as HTMLButtonElement;
    expect(option).toBeTruthy();
    await act(async () => {
      option.click();
    });
    expect(applyActiveProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", display_name: "Alpha" }),
    );
    unmount();
  });
});
