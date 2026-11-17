import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { SpectrogramFileSegmentRail } from "./SpectrogramFileSegmentRail";

describe("SpectrogramFileSegmentRail", () => {
  it("renders segment blocks and range slider for long files", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".analysis-minimap-segment").length).toBe(3);
    expect(container.querySelector('input[type="range"]')).toBeTruthy();
    unmount();
  });

  it("renders m04 studio strip: fileframe with name+arrows, muted meta, sep, segment, nav", () => {
    const onFilePrev = vi.fn();
    const onFileNext = vi.fn();
    const onFileMenuToggle = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={450}
        viewStart={200}
        viewSpan={200}
        segmentIndex={1}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        fileName="01 Just Passing Through.wav"
        fileMeta="48 кГц · канал 1 · 23:12"
        onFileMenuToggle={onFileMenuToggle}
        onFilePrev={onFilePrev}
        onFileNext={onFileNext}
        canFilePrev
        canFileNext
      />,
    );
    expect(
      container.querySelector(".analysis-segment-rail-studio-head"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-fileframe"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-wave"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-filename")?.textContent,
    ).toBe("01 Just Passing Through.wav");
    // Legacy separate filemenu / filenav clusters are gone from Analysis.
    expect(
      container.querySelector("button.analysis-segment-rail-studio-filemenu"),
    ).toBeNull();
    expect(
      container.querySelector(".analysis-segment-rail-studio-filenav"),
    ).toBeNull();
    const fileNavBtns = container.querySelectorAll(
      ".analysis-segment-rail-studio-fileframe-nav",
    );
    expect(fileNavBtns.length).toBe(2);
    for (const btn of fileNavBtns) {
      const path = btn.querySelector("path");
      expect(path?.getAttribute("fill")).toBe("currentColor");
      expect(path?.getAttribute("stroke")).toBe("none");
    }
    (fileNavBtns[0] as HTMLButtonElement).click();
    (fileNavBtns[1] as HTMLButtonElement).click();
    expect(onFilePrev).toHaveBeenCalledOnce();
    expect(onFileNext).toHaveBeenCalledOnce();
    const main = container.querySelector(
      "button.analysis-segment-rail-studio-fileframe-main",
    ) as HTMLButtonElement;
    expect(main).toBeTruthy();
    expect(main.getAttribute("aria-expanded")).toBe("false");
    expect(
      main.querySelector(".analysis-segment-rail-studio-fileframe-caret"),
    ).toBeTruthy();
    main.click();
    expect(onFileMenuToggle).toHaveBeenCalledOnce();
    const wrap = container.querySelector(
      ".analysis-segment-rail-studio-fileframe-wrap",
    );
    const end = container.querySelector(
      ".analysis-segment-rail-studio-file-end",
    );
    const meta = container.querySelector(
      ".analysis-segment-rail-studio-filemeta-muted",
    );
    expect(meta?.textContent).toBe("48 кГц · канал 1 · 23:12");
    expect(wrap?.nextElementSibling).toBe(end);
    expect(end?.firstElementChild).toBe(meta);
    expect(
      container.querySelector(".analysis-segment-rail-studio-sep"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-cmap"),
    ).toBeNull();
    expect(
      container.querySelector(".analysis-segment-rail-studio-right"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-title")?.textContent,
    ).toMatch(/2\s*\/\s*3/);
    expect(
      container.querySelector(".analysis-segment-rail-studio-range")?.textContent,
    ).toMatch(/—/);
    expect(
      container.querySelector(".analysis-segment-rail-studio-duration")?.textContent,
    ).toMatch(/200/);
    expect(
      container.querySelector(".analysis-segment-rail-studio-time"),
    ).toBeNull();
    expect(
      container.querySelectorAll(".analysis-segment-rail-studio-nav-btn").length,
    ).toBe(2);
    expect(container.querySelector(".analysis-minimap")).toBeNull();
    expect(
      container.querySelector(".analysis-segment-rail-studio-block"),
    ).toBeNull();
    unmount();
  });

  it("orders fileframe → rate meta → Исходные/Фильтр", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        fileName="track.wav"
        fileMeta="48 кГц · канал 1 · 23:12"
        onFileMenuToggle={vi.fn()}
        labelSource={{
          kind: "original",
          originalAvailable: true,
          filteredAvailable: true,
          fileName: "track_predicted_filtered.txt",
          onChange: vi.fn(),
        }}
      />,
    );
    const end = container.querySelector(
      ".analysis-segment-rail-studio-file-end",
    );
    const children = Array.from(end?.children ?? []).map(
      (el) => el.className,
    );
    expect(children[0]).toContain("analysis-segment-rail-studio-filemeta-muted");
    expect(children[1]).toContain("analysis-segment-rail-studio-labels");
    expect(
      container.querySelector(".analysis-segment-rail-studio-fileframe-wrap")
        ?.nextElementSibling,
    ).toBe(end);
    unmount();
  });

  it("opens a colormap-style file list under the frame (not a modal)", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        fileName="track_b.wav"
        onFileMenuToggle={vi.fn()}
        onFileMenuClose={onClose}
        fileMenuOpen
        fileMenuFiles={[
          { name: "track_a.wav" },
          { name: "track_b.wav" },
          { name: "track_c.wav" },
        ]}
        fileMenuActiveName="track_b.wav"
        onFileMenuSelect={onSelect}
        onFilePrev={vi.fn()}
        onFileNext={vi.fn()}
        canFilePrev={false}
        canFileNext={false}
      />,
    );
    expect(
      container.querySelector(".predict-results-file-picker-modal"),
    ).toBeNull();
    const list = container.querySelector(
      ".analysis-segment-rail-studio-filemenu-list",
    );
    expect(list).toBeTruthy();
    const items = list?.querySelectorAll(
      ".analysis-segment-rail-studio-filemenu-item",
    );
    expect(items?.length).toBe(3);
    expect(items?.[1]?.classList.contains("is-selected")).toBe(true);
    (items?.[0] as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith("track_a.wav");
    expect(onClose).toHaveBeenCalledOnce();
    const main = container.querySelector(
      "button.analysis-segment-rail-studio-fileframe-main",
    );
    expect(main?.classList.contains("is-open")).toBe(true);
    expect(main?.getAttribute("aria-expanded")).toBe("true");
    const nav = container.querySelectorAll(
      ".analysis-segment-rail-studio-fileframe-nav",
    );
    expect((nav[0] as HTMLButtonElement).disabled).toBe(true);
    expect((nav[1] as HTMLButtonElement).disabled).toBe(true);
    unmount();
  });

  it("opens the colormap menu on the right of the separator", () => {
    const onColormapChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        colormap="gray"
        onColormapChange={onColormapChange}
      />,
    );
    const right = container.querySelector(".analysis-segment-rail-studio-right");
    const sep = container.querySelector(".analysis-segment-rail-studio-sep");
    expect(sep?.nextElementSibling).toBe(right);
    const cmap = right?.querySelector(".analysis-segment-rail-studio-cmap");
    const button = right?.querySelector(
      ".analysis-segment-rail-studio-cmap-btn",
    ) as HTMLButtonElement;
    expect(button.textContent).toContain("Greys");
    expect(right?.firstElementChild).toBe(cmap);
    act(() => {
      button.click();
    });
    const items = container.querySelectorAll(
      ".analysis-segment-rail-studio-cmap-item",
    );
    expect(items.length).toBe(6);
    act(() => {
      (items[2] as HTMLButtonElement).click();
    });
    expect(onColormapChange).toHaveBeenCalledWith("plasma");
    unmount();
  });

  it("keeps Classes/Player separate from the colormap control", () => {
    const onClasses = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        colormap="gray"
        onColormapChange={vi.fn()}
        onClassesFilterToggle={onClasses}
        classesFilterOpen={false}
      />,
    );
    const right = container.querySelector(".analysis-segment-rail-studio-right");
    const cmap = right?.querySelector(".analysis-segment-rail-studio-cmap");
    const mode = right?.querySelector(".analysis-segment-rail-studio-mode");
    expect(cmap).toBeTruthy();
    expect(mode).toBeTruthy();
    expect(cmap?.contains(mode as Node)).toBe(false);
    expect(mode?.previousElementSibling).toBe(cmap);
    const modeBtns = mode?.querySelectorAll(
      ".analysis-segment-rail-studio-mode-btn",
    );
    expect(modeBtns?.length).toBe(2);
    expect(modeBtns?.[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(modeBtns?.[1]?.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      (modeBtns?.[0] as HTMLButtonElement).click();
    });
    expect(onClasses).toHaveBeenCalledOnce();
    act(() => {
      (modeBtns?.[1] as HTMLButtonElement).click();
    });
    expect(onClasses).toHaveBeenCalledOnce();
    unmount();
  });

  it("treats a 3:20 leftover as a single segment", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={200.4}
        viewStart={0}
        viewSpan={200.4}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
      />,
    );
    expect(
      container.querySelector(".analysis-segment-rail-studio-title")?.textContent,
    ).toMatch(/1\s*\/\s*1/);
    const nav = container.querySelectorAll(
      ".analysis-segment-rail-studio-nav-btn",
    );
    expect(nav.length).toBe(2);
    expect((nav[0] as HTMLButtonElement).disabled).toBe(true);
    expect((nav[1] as HTMLButtonElement).disabled).toBe(true);
    // Option A: solid filled triangles (not outline chevrons).
    for (const btn of nav) {
      const path = btn.querySelector("path");
      expect(path?.getAttribute("fill")).toBe("currentColor");
      expect(path?.getAttribute("stroke")).toBe("none");
    }
    unmount();
  });

  it("hides studio rail when duration is zero", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        durationSec={0}
        viewStart={0}
        viewSpan={0}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it("fileNavOnly still renders without WAV duration (Filter track)", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        fileNavOnly
        durationSec={0}
        viewStart={0}
        viewSpan={1}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        fileName="track.wav"
        onFilePrev={vi.fn()}
        onFileNext={vi.fn()}
        canFilePrev={false}
        canFileNext={true}
      />,
    );
    expect(
      container.querySelector(".analysis-segment-rail-studio.is-file-nav-only"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-filename")
        ?.textContent,
    ).toBe("track.wav");
    expect(
      container.querySelector(".analysis-segment-rail-studio-right"),
    ).toBeNull();
    unmount();
  });

  it("table-hero fileNavOnly shows classes filter button and hides segment chrome", () => {
    const onClasses = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramFileSegmentRail
        studioLayout
        fileNavOnly
        durationSec={450}
        viewStart={0}
        viewSpan={200}
        segmentIndex={0}
        onViewStartChange={vi.fn()}
        onSegmentSelect={vi.fn()}
        fileName="track.wav"
        onClassesFilterToggle={onClasses}
        classesFilterOpen={false}
      />,
    );
    expect(
      container.querySelector(".analysis-segment-rail-studio-right"),
    ).toBeNull();
    const btn = container.querySelector(
      "button.analysis-segment-rail-studio-classes",
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onClasses).toHaveBeenCalledOnce();
    expect(
      container.querySelector(".analysis-segment-rail-studio.is-file-nav-only"),
    ).toBeTruthy();
    unmount();
  });
});
