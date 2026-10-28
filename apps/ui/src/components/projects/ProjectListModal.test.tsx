import { describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "../../api/projects";
import { renderWithProviders } from "../../test/render";
import { ProjectListModal } from "./ProjectListModal";
import { ProjectsActionsBar } from "./ProjectsActionsBar";

const project = (over: Partial<ProjectRecord> = {}): ProjectRecord =>
  ({
    id: "p1",
    display_name: "Alpha",
    path: "/tmp/Alpha",
    description: "",
    orcai_name: "Alpha",
    project_kind: "recognition",
    focus: "full",
    focus_source: "stored",
    created_at: 1,
    updated_at: 1,
    wav_count: 0,
    initialized: true,
    recording_table_path: null,
    recordings_dir: "/tmp/Alpha/recordings",
    ...over,
  }) as ProjectRecord;

describe("ProjectsActionsBar · project list", () => {
  it("renders Список проектов after refresh and opens via callback", () => {
    const onOpenProjectList = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectsActionsBar
        hasProject
        busy={false}
        onCreate={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenProjectList={onOpenProjectList}
      />,
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    const listBtn = buttons.find((b) => /Список проектов|Project list/i.test(b.textContent ?? ""));
    expect(listBtn).toBeTruthy();
    listBtn!.click();
    expect(onOpenProjectList).toHaveBeenCalledOnce();
    unmount();
  });
});

describe("ProjectListModal", () => {
  it("lists projects with open-here vs app-active badges and wires actions", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const { unmount } = renderWithProviders(
      <ProjectListModal
        open
        projects={[
          project({ id: "cur", display_name: "Current", path: "/tmp/Current" }),
          project({
            id: "p2",
            display_name: "Beta",
            path: "/tmp/Beta",
            orcai_name: "Beta",
          }),
        ]}
        currentProjectId="cur"
        activeProjectId="p2"
        onClose={onClose}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );
    const root = document.body;
    expect(root.textContent).toMatch(/Current/);
    expect(root.textContent).toMatch(/Beta/);
    expect(root.textContent).toMatch(/open here|открыт здесь/i);
    expect(root.textContent).toMatch(/active in app|активен в приложении/i);

    const mains = root.querySelectorAll<HTMLButtonElement>(".ps-project-list-main");
    expect(mains.length).toBe(2);
    mains[0].click(); // current → close
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    mains[1].click();
    expect(onOpen).toHaveBeenCalledOnce();

    const tools = root.querySelectorAll<HTMLButtonElement>(".ps-project-list-tools button");
    expect(tools.length).toBe(2);
    tools[0].click();
    expect(onDelete).toHaveBeenCalledOnce();
    unmount();
  });

  it("shows empty copy when registry is empty", () => {
    const { unmount } = renderWithProviders(
      <ProjectListModal
        open
        projects={[]}
        currentProjectId={null}
        activeProjectId={null}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(document.body.querySelector(".ps-project-list-empty")).toBeTruthy();
    unmount();
  });
});
