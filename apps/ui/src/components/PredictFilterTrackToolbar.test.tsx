import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import type { PredictQueueFile } from "../workspace/predictQueue";
import { PredictFilterTrackToolbar } from "./PredictFilterTrackToolbar";

function wav(name: string, extra?: Partial<PredictQueueFile>): PredictQueueFile {
  return {
    name,
    path: `/p/${name}`,
    kind: "wav",
    bit_depth: 16,
    sample_rate_hz: 48_000,
    duration_sec: 144,
    status: "done",
    labelPath: `/p/${name.replace(/\.wav$/i, "")}_predicted.txt`,
    ...extra,
  };
}

describe("PredictFilterTrackToolbar", () => {
  it("shows the current WAV and steps to the next filter source", () => {
    const a = wav("10 Slow Motion.wav");
    const b = wav("11 Next.wav");
    const onSelect = vi.fn();
    const { container, unmount } = renderWithProviders(
      <PredictFilterTrackToolbar
        sources={[
          { file: a, predictedPath: a.labelPath! },
          { file: b, predictedPath: b.labelPath! },
        ]}
        activePredictedPath={a.labelPath!}
        channel={1}
        onSelectPredictedPath={onSelect}
      />,
    );
    expect(
      container.querySelector(".analysis-segment-rail-studio-filename")
        ?.textContent,
    ).toBe("10 Slow Motion.wav");
    expect(
      container.querySelector(".analysis-segment-rail-studio-filemeta-muted")
        ?.textContent,
    ).toMatch(/48/);
    const next = container.querySelectorAll(
      ".analysis-segment-rail-studio-filenav-btn",
    )[1] as HTMLButtonElement;
    next.click();
    expect(onSelect).toHaveBeenCalledWith(b.labelPath);
    unmount();
  });

  it("renders nothing without sources", () => {
    const { container, unmount } = renderWithProviders(
      <PredictFilterTrackToolbar
        sources={[]}
        activePredictedPath=""
        channel={1}
        onSelectPredictedPath={vi.fn()}
      />,
    );
    expect(container.querySelector(".predict-filter-track-bar")).toBeNull();
    unmount();
  });
});
