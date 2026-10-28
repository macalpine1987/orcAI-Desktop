import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createLabelColorMap } from "../lib/labelColors";
import { renderWithProviders } from "../test/render";
import { SpectrogramOverlay, type OverlaySegment } from "./SpectrogramOverlay";

async function flushEffects() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("SpectrogramOverlay", () => {
  const baseSeg: OverlaySegment = {
    start: 1,
    stop: 2,
    label: "call",
    mean_p: 0.9,
    label_source: "orcai",
    source: "primary",
    start_sec: 1,
    stop_sec: 2,
  };

  it("uses class-lane Y even when TF Hz bounds are present", async () => {
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[{ ...baseSeg, hz_min: 500, hz_max: 4000 }]}
          labelNames={["call"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["call"])}
          hiddenLabels={new Set()}
          soloLabel={null}
          nyquistHz={8000}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const box = container.querySelector('[data-testid="spectrogram-overlay-box"]');
    expect(box).toBeTruthy();
    expect(box?.getAttribute("data-layout")).toBe("class-lane");
    expect(box?.getAttribute("title")).toMatch(/call/i);
    expect(box?.getAttribute("title") ?? "").not.toMatch(/Hz/i);
    const style = box?.getAttribute("style") ?? "";
    // Flat class band (~11% of plot), not a tall TF box.
    expect(parseFloat(style.match(/height: ([\d.]+)%/)?.[1] ?? "100")).toBeLessThan(25);
    unmount();
  });

  it("calls onSegmentClick when a box is clicked", async () => {
    const onSegmentClick = vi.fn();
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[{ ...baseSeg, hz_min: 1000, hz_max: 3000 }]}
          labelNames={["call"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["call"])}
          hiddenLabels={new Set()}
          soloLabel={null}
          nyquistHz={8000}
          onSegmentClick={onSegmentClick}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const box = container.querySelector('[data-testid="spectrogram-overlay-box"]') as HTMLElement;
    box.click();
    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({ label: "call" }),
    );
    unmount();
  });

  it("highlights the selected detection and soft-dims others", async () => {
    const segA = { ...baseSeg, start_sec: 1, stop_sec: 2 };
    const segB = {
      ...baseSeg,
      start: 4,
      stop: 5,
      start_sec: 4,
      stop_sec: 5,
      label: "pulse",
    };
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[segA, { ...segB, hz_min: 500, hz_max: 2000 }]}
          labelNames={["call", "pulse"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["call", "pulse"])}
          hiddenLabels={new Set()}
          soloLabel={null}
          selectedSegment={{ t0: 4, t1: 5, label: "pulse" }}
          nyquistHz={8000}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const boxes = container.querySelectorAll('[data-testid="spectrogram-overlay-box"]');
    expect(boxes.length).toBe(2);
    const selected = container.querySelector('[data-selected="true"]');
    expect(selected).toBeTruthy();
    const selectedOpacity = parseFloat(
      selected?.getAttribute("data-fill-opacity") ?? "0",
    );
    const other = [...boxes].find((el) => el.getAttribute("data-selected") !== "true");
    const otherOpacity = parseFloat(
      other?.getAttribute("data-fill-opacity") ?? "0",
    );
    expect(selectedOpacity).toBeGreaterThan(0.8);
    expect(otherOpacity).toBeGreaterThan(0.25);
    expect(otherOpacity).toBeLessThan(selectedOpacity);
    expect(selected?.getAttribute("style") ?? "").not.toMatch(/opacity:/);
    unmount();
  });

  it("places different classes on different horizontal levels", async () => {
    const a = { ...baseSeg, label: "whistles", hz_min: 4000, hz_max: 6000 };
    const b = {
      ...baseSeg,
      start: 4,
      stop: 5,
      start_sec: 4,
      stop_sec: 5,
      label: "buzzing",
      hz_min: 12000,
      hz_max: 14000,
    };
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[a, b]}
          labelNames={["whistles", "buzzing"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["whistles", "buzzing"])}
          hiddenLabels={new Set()}
          soloLabel={null}
          nyquistHz={16_000}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const boxes = [
      ...container.querySelectorAll('[data-testid="spectrogram-overlay-box"]'),
    ] as HTMLElement[];
    expect(boxes).toHaveLength(2);
    const tops = boxes.map((el) =>
      parseFloat((el.getAttribute("style") ?? "").match(/top: ([\d.]+)%/)?.[1] ?? "0"),
    );
    expect(Math.abs(tops[0] - tops[1])).toBeGreaterThan(5);
    unmount();
  });

  it("fades all marks when markOpacity is 0", async () => {
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[{ ...baseSeg, hz_min: 500, hz_max: 2000 }]}
          labelNames={["call"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["call"])}
          hiddenLabels={new Set()}
          soloLabel={null}
          markOpacity={0}
          nyquistHz={8000}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const box = container.querySelector('[data-testid="spectrogram-overlay-box"]');
    const opacity = parseFloat(box?.getAttribute("data-fill-opacity") ?? "1");
    expect(opacity).toBe(0);
    expect(box?.getAttribute("style") ?? "").toMatch(/transparent|rgba\(.*,\s*0\)/);
    unmount();
  });

  it("hides overlays for labels in hiddenLabels (Т-4 class legend)", async () => {
    const { container, unmount } = renderWithProviders(
      <div style={{ width: 400, height: 200, position: "relative" }}>
        <SpectrogramOverlay
          segments={[
            { ...baseSeg, label: "whistles" },
            {
              ...baseSeg,
              start: 4,
              stop: 5,
              start_sec: 4,
              stop_sec: 5,
              label: "buzzing",
            },
          ]}
          labelNames={["whistles", "buzzing"]}
          viewStart={0}
          viewSpan={10}
          durationSec={60}
          colorMap={createLabelColorMap(["whistles", "buzzing"])}
          hiddenLabels={new Set(["buzzing"])}
          soloLabel={null}
          nyquistHz={8000}
          layoutSize={{ w: 400, h: 200 }}
        />
      </div>,
    );
    await flushEffects();
    const boxes = container.querySelectorAll(
      '[data-testid="spectrogram-overlay-box"]',
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.getAttribute("title") ?? "").toMatch(/whistles/i);
    expect(boxes[0]?.getAttribute("title") ?? "").not.toMatch(/buzzing/i);
    unmount();
  });
});
