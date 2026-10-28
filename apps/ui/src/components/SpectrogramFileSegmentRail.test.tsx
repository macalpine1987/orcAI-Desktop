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

  it("renders m04 studio strip: wave, file, muted meta, sep, segment, nav", () => {
    const onFilePrev = vi.fn();
    const onFileNext = vi.fn();
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
        onFileMenuToggle={vi.fn()}
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
      container.querySelector(".analysis-segment-rail-studio-wave"),
    ).toBeTruthy();
    expect(
      container.querySelector(".analysis-segment-rail-studio-filename")?.textContent,
    ).toBe("01 Just Passing Through.wav");
    expect(
      container.querySelector("button.analysis-segment-rail-studio-filemenu"),
    ).toBeTruthy();
    const fileNavBtns = container.querySelectorAll(
      ".analysis-segment-rail-studio-filenav-btn",
    );
    expect(fileNavBtns.length).toBe(2);
    (fileNavBtns[0] as HTMLButtonElement).click();
    (fileNavBtns[1] as HTMLButtonElement).click();
    expect(onFilePrev).toHaveBeenCalledOnce();
    expect(onFileNext).toHaveBeenCalledOnce();
    expect(
      container.querySelector(".analysis-segment-rail-studio-filemeta-muted")
        ?.textContent,
    ).toBe("48 кГц · канал 1 · 23:12");
    expect(
      container.querySelector(".analysis-segment-rail-studio-sep"),
    ).toBeTruthy();
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
