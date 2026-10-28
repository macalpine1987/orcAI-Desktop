import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { ProjectNoSelectionEmpty } from "./ProjectNoSelectionEmpty";

describe("ProjectNoSelectionEmpty · no-project landing", () => {
  it("renders two path cards without a work toolbar duplicate", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectNoSelectionEmpty
        busy={false}
        sidecarOnline
        onCreate={onCreate}
        onOpenExisting={onOpen}
      />,
    );
    expect(container.querySelector(".ps-welcome")).toBeTruthy();
    const paths = container.querySelectorAll<HTMLButtonElement>(".ps-welcome-path");
    expect(paths.length).toBe(2);
    expect(paths[0].classList.contains("is-primary")).toBe(true);
    expect(container.querySelector(".ps-welcome-memo")).toBeTruthy();
    expect(container.textContent).toMatch(/recordings\/|Inside the folder|Внутри каталога/i);
    expect(container.textContent).toMatch(/Open project folder|Открыть папку проекта/);
    expect(container.textContent).not.toMatch(/Open existing|Открыть существующую/);
    expect(container.querySelectorAll(".ps-btn").length).toBe(0);
    paths[0].click();
    paths[1].click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("offline: hint only, no path CTAs", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectNoSelectionEmpty
        busy={false}
        sidecarOnline={false}
        onCreate={vi.fn()}
        onOpenExisting={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".ps-welcome-path").length).toBe(0);
    expect(container.textContent?.length).toBeGreaterThan(0);
    unmount();
  });
});
