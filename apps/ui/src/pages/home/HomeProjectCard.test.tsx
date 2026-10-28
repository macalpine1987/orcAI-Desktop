import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderWithProviders } from "../../test/render";
import { HomeProjectCard, shortHomeModelLabel } from "./HomeProjectCard";

vi.mock("../../platform/shell", () => ({
  revealInFileManager: vi.fn().mockResolvedValue(undefined),
}));

import { revealInFileManager } from "../../platform/shell";

describe("shortHomeModelLabel", () => {
  it("strips orcai- prefix for LCD (m01)", () => {
    expect(shortHomeModelLabel("orcai-isl-v1")).toBe("isl-v1");
    expect(shortHomeModelLabel("isl-v1")).toBe("isl-v1");
    expect(shortHomeModelLabel(null)).toBeNull();
  });

  it("uses basename for trained model absolute paths", () => {
    expect(
      shortHomeModelLabel(
        "/Users/vadimromanov/Desktop/untitled folder 2/new2/models/new2",
      ),
    ).toBe("new2");
    expect(shortHomeModelLabel("C:\\proj\\models\\fjord")).toBe("fjord");
    expect(shortHomeModelLabel("/tmp/models/orcai-local-v1")).toBe("local-v1");
  });
});

describe("HomeProjectCard · B-01/B-02", () => {
  it("B-01 renders LCD metrics from props (not hardcoded)", () => {
    const { container, unmount } = renderWithProviders(
      <HomeProjectCard
        projectName="Isafjordur-2026"
        projectPath="~/Documents/orcai/Isafjordur-2026"
        recordings={12}
        annotations={9}
        predicted={7}
        activeModelLabel="orcai-isl-v1"
        tableSyncStatus="current"
        onChangeProject={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("Isafjordur-2026");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("9");
    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("isl-v1");
    expect(container.textContent).not.toContain("orcai-isl-v1");
    expect(container.querySelectorAll(".home-project-metric.is-accent").length).toBe(4);
    expect(container.querySelector(".home-card-eyebrow")).toBeTruthy();
    expect(container.querySelector(".home-project-name")?.textContent).toBe(
      "Isafjordur-2026",
    );
    unmount();
  });

  it("B-02 shows sync status for current / stale / missing", () => {
    for (const [status, re] of [
      ["current", /recording table is up to date|таблица записей актуальна/i],
      ["stale", /recording table is out of date|таблица записей устарела/i],
      ["missing", /recording table missing|нет таблицы записей/i],
    ] as const) {
      const { container, unmount } = renderWithProviders(
        <HomeProjectCard
          projectName="P"
          projectPath="/p"
          recordings={1}
          annotations={0}
          predicted={0}
          activeModelLabel={null}
          tableSyncStatus={status}
          onChangeProject={vi.fn()}
        />,
      );
      expect(container.textContent, status).toMatch(re);
      expect(
        container.querySelector(`.home-project-table-status.is-${status}`),
      ).toBeTruthy();
      unmount();
    }
  });

  it("Open folder has icon and reveals project path; Change navigates", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <HomeProjectCard
        projectName="Demo"
        projectPath="/tmp/demo"
        recordings={0}
        annotations={0}
        predicted={0}
        activeModelLabel={null}
        tableSyncStatus={null}
        engineReady
        onChangeProject={onChange}
      />,
    );
    const openBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /Open folder|Открыть папку/i.test(b.textContent ?? ""),
    );
    expect(openBtn).toBeTruthy();
    expect(openBtn?.querySelector("svg")).toBeTruthy();
    act(() => {
      openBtn?.click();
    });
    expect(revealInFileManager).toHaveBeenCalledWith("/tmp/demo");

    const changeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /Go|Перейти/i.test(b.textContent ?? ""),
    );
    expect(changeBtn).toBeTruthy();
    expect((changeBtn as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      changeBtn?.click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("disables Go when engine is not ready", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <HomeProjectCard
        projectName="Demo"
        projectPath="/tmp/demo"
        recordings={0}
        annotations={0}
        predicted={0}
        activeModelLabel={null}
        tableSyncStatus={null}
        engineReady={false}
        onChangeProject={onChange}
      />,
    );
    const changeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /Go|Перейти/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(changeBtn.disabled).toBe(true);
    act(() => {
      changeBtn.click();
    });
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  it("empty project shows empty copy without sync indicator", () => {
    const { container, unmount } = renderWithProviders(
      <HomeProjectCard
        projectName={null}
        projectPath={null}
        recordings={null}
        annotations={null}
        predicted={null}
        activeModelLabel={null}
        tableSyncStatus={null}
        onChangeProject={vi.fn()}
      />,
    );
    expect(container.querySelector(".home-project-table-status")).toBeNull();
    expect(container.textContent).toMatch(/No project selected|Проект не выбран/i);
    unmount();
  });
});
